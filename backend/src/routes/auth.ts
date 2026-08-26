/**
 * Auth routes — email/password + Google/Apple OAuth
 *
 * POST /api/auth/register      — create account with email + password
 * POST /api/auth/login         — sign in with email + password
 * POST /api/auth/oauth         — sign in via Google / Apple (token exchange)
 * GET  /api/auth/me            — get current user (requires Bearer token)
 * POST /api/auth/coupon        — apply a coupon code
 * POST /api/auth/logout        — client-side logout (just instructs client to clear token)
 */

import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { createHash, randomBytes } from "crypto";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb, newId } from "../db";
import { rateLimit } from "../middleware/rateLimit";
import {
  verifyIdToken,
  audienceList,
  OidcError,
  APPLE_JWKS_URI,
  APPLE_ISSUERS,
  GOOGLE_JWKS_URI,
  GOOGLE_ISSUERS,
} from "../lib/oidc";

const authRouter = new Hono();

const getSecret = () => process.env.JWT_SECRET!;

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string | null;
  avatar_url: string | null;
  auth_provider: string;
  provider_id: string | null;
  subscription_status: string;
  trial_starts_at: string;
  trial_ends_at: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function userToPublic(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    authProvider: user.auth_provider,
    subscriptionStatus: user.subscription_status,
    trialEndsAt: user.trial_ends_at,
    isSubscribed: isSubscribed(user),
    createdAt: user.created_at,
  };
}

// The app is free for everyone right now — no paywall, no plans.
// Subscription columns stay in the schema so paid tiers can return later.
function isSubscribed(_user: UserRow): boolean {
  return true;
}

async function issueToken(userId: string): Promise<string> {
  return sign(
    { userId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 15 }, // 15 min
    getSecret()
  );
}

async function issueRefreshToken(userId: string): Promise<string> {
  const raw = randomBytes(48).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  const db = getDb();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  db.run(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    [newId(), userId, hash, expiresAt]
  );
  return raw;
}

async function getUserFromBearer(authHeader: string | undefined): Promise<UserRow | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const payload = await verify(token, getSecret()) as { userId: string };
    const db = getDb();
    return db.query("SELECT * FROM users WHERE id = ?").get(payload.userId) as UserRow | null;
  } catch {
    return null;
  }
}

// ─── Register (email/password) ────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().max(100).optional(),
});

authRouter.post("/register", rateLimit(5, 60_000), zValidator("json", registerSchema), async (c) => {
  const body = c.req.valid("json");

  const db = getDb();
  const existing = db.query("SELECT id FROM users WHERE email = ?").get(body.email.toLowerCase());
  if (existing) {
    return c.json({ error: "An account with this email already exists" }, 409);
  }

  const hash = await Bun.password.hash(body.password, { algorithm: "bcrypt", cost: 10 });
  const userId = newId();

  db.run(
    `INSERT INTO users (id, email, password_hash, display_name, auth_provider)
     VALUES (?, ?, ?, ?, 'email')`,
    [userId, body.email.toLowerCase(), hash, body.name ?? null]
  );

  const user = db.query("SELECT * FROM users WHERE id = ?").get(userId) as UserRow;
  const token = await issueToken(userId);
  const refreshToken = await issueRefreshToken(userId);

  return c.json({ success: true, token, refreshToken, user: userToPublic(user) });
});

// ─── Login (email/password) ───────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", rateLimit(10, 60_000), zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");

  const db = getDb();
  const user = db.query("SELECT * FROM users WHERE email = ?").get(body.email.toLowerCase()) as UserRow | null;

  if (!user || !user.password_hash) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const valid = await Bun.password.verify(body.password, user.password_hash);
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const token = await issueToken(user.id);
  const refreshToken = await issueRefreshToken(user.id);
  return c.json({ success: true, token, refreshToken, user: userToPublic(user) });
});

// ─── OAuth (Google / Apple) ───────────────────────────────────────────────────

const oauthSchema = z.object({
  provider: z.enum(["google", "apple"]),
  /** Google: OAuth2 access token. Only accepted when no idToken is supplied. */
  accessToken: z.string().optional(),
  /** Apple: `credential.identityToken`. Google: `id_token`. Required for Apple. */
  idToken: z.string().optional(),
  /** Display-only hints. Identity is always taken from the verified token. */
  name: z.string().max(100).optional(),
  avatarUrl: z.string().url().optional(),
  /** Optional nonce; when supplied it must match the token's `nonce` claim. */
  nonce: z.string().max(200).optional(),
});

/** Identity established by verifying a provider token — never client-supplied. */
interface VerifiedIdentity {
  providerId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

async function verifyApple(body: z.infer<typeof oauthSchema>): Promise<VerifiedIdentity> {
  const audiences = audienceList(process.env.APPLE_BUNDLE_IDS);
  if (audiences.length === 0) throw new OidcError("Apple sign-in is not configured on this server");
  if (!body.idToken) throw new OidcError("idToken is required for Apple sign-in");

  const claims = await verifyIdToken(body.idToken, {
    jwksUri: APPLE_JWKS_URI,
    issuers: APPLE_ISSUERS,
    audiences,
    nonce: body.nonce,
  });

  // Apple returns email only on the very first authorization; on later
  // sign-ins we recognise the user by `sub` (stable per app) instead.
  return {
    providerId: claims.sub,
    email: claims.email?.toLowerCase() ?? null,
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name: body.name ?? null,
    avatarUrl: null,
  };
}

async function verifyGoogle(body: z.infer<typeof oauthSchema>): Promise<VerifiedIdentity> {
  const audiences = audienceList(process.env.GOOGLE_CLIENT_IDS);
  if (audiences.length === 0) throw new OidcError("Google sign-in is not configured on this server");

  if (body.idToken) {
    const claims = await verifyIdToken(body.idToken, {
      jwksUri: GOOGLE_JWKS_URI,
      issuers: GOOGLE_ISSUERS,
      audiences,
      nonce: body.nonce,
    });
    return {
      providerId: claims.sub,
      email: claims.email?.toLowerCase() ?? null,
      emailVerified: claims.email_verified === true || claims.email_verified === "true",
      name: body.name ?? claims.name ?? null,
      avatarUrl: body.avatarUrl ?? claims.picture ?? null,
    };
  }

  if (!body.accessToken) throw new OidcError("idToken or accessToken is required for Google sign-in");

  // Bare access tokens carry no audience of their own, so a token minted for
  // *any* app would otherwise be accepted here. tokeninfo tells us which
  // client the token was issued to; reject anything that isn't ours.
  const infoRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(body.accessToken)}`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!infoRes.ok) throw new OidcError("Invalid Google access token");
  const info = (await infoRes.json()) as { aud?: string; sub?: string; email?: string; email_verified?: string; expires_in?: string };

  if (!info.aud || !audiences.includes(info.aud)) throw new OidcError("Google token was not issued to this app");
  if (!info.sub) throw new OidcError("Google token has no subject");

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${body.accessToken}` },
    signal: AbortSignal.timeout(5000),
  });
  const profile = profileRes.ok
    ? ((await profileRes.json()) as { name?: string; picture?: string })
    : {};

  return {
    providerId: info.sub,
    email: info.email?.toLowerCase() ?? null,
    emailVerified: info.email_verified === "true",
    name: body.name ?? profile.name ?? null,
    avatarUrl: body.avatarUrl ?? profile.picture ?? null,
  };
}

authRouter.post("/oauth", rateLimit(10, 60_000), zValidator("json", oauthSchema), async (c) => {
  const body = c.req.valid("json");

  let identity: VerifiedIdentity;
  try {
    identity = body.provider === "apple" ? await verifyApple(body) : await verifyGoogle(body);
  } catch (err) {
    if (err instanceof OidcError) {
      console.warn(`[auth] ${body.provider} verification rejected:`, err.message);
      return c.json({ error: err.message }, 401);
    }
    console.error(`[auth] ${body.provider} verification error:`, err);
    return c.json({ error: "Could not verify sign-in with provider" }, 502);
  }

  const providerId = identity.providerId;
  const email = identity.email;
  const name = identity.name;
  const avatarUrl = identity.avatarUrl;

  const db = getDb();

  // Match on the provider subject first — it is the only stable, verified key.
  const link = db
    .query<{ user_id: string }, [string, string]>(
      "SELECT user_id FROM user_identities WHERE provider = ? AND provider_id = ?"
    )
    .get(body.provider, providerId);

  let user = link
    ? (db.query("SELECT * FROM users WHERE id = ?").get(link.user_id) as UserRow | null)
    : null;

  // Fall back to email only when the provider vouched for it. Linking on an
  // unverified address would let anyone claim an existing account.
  if (!user && email && identity.emailVerified) {
    user = db.query("SELECT * FROM users WHERE email = ?").get(email) as UserRow | null;
  }

  if (!user) {
    // Apple omits the email on every sign-in after the first, so a brand-new
    // account may legitimately have none. Synthesise a unique placeholder.
    const userId = newId();
    const fallbackEmail = email ?? `${body.provider}_${providerId}@noemail.local`;
    db.run(
      `INSERT INTO users (id, email, display_name, avatar_url, auth_provider, provider_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, fallbackEmail, name, avatarUrl, body.provider, providerId]
    );
    user = db.query("SELECT * FROM users WHERE id = ?").get(userId) as UserRow;
  }

  // Record (or re-affirm) the verified identity link.
  db.run(
    `INSERT OR IGNORE INTO user_identities (id, user_id, provider, provider_id, email)
     VALUES (?, ?, ?, ?, ?)`,
    [newId(), user.id, body.provider, providerId, email]
  );

  // Backfill display fields the account was created without.
  if (name && !user.display_name) {
    db.run("UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?", [name, user.id]);
  }
  if (avatarUrl && !user.avatar_url) {
    db.run("UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?", [avatarUrl, user.id]);
  }
  user = db.query("SELECT * FROM users WHERE id = ?").get(user.id) as UserRow;

  const token = await issueToken(user.id);
  const refreshToken = await issueRefreshToken(user.id);
  return c.json({ success: true, token, refreshToken, user: userToPublic(user) });
});

// ─── Get current user ─────────────────────────────────────────────────────────

authRouter.get("/me", async (c) => {
  const user = await getUserFromBearer(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ user: userToPublic(user) });
});

// ─── Apply coupon ─────────────────────────────────────────────────────────────

authRouter.post("/coupon", async (c) => {
  const user = await getUserFromBearer(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json<{ code: string }>().catch(() => ({ code: "" }));
  const code = (body.code ?? "").trim().toUpperCase();

  if (!code) {
    return c.json({ error: "Coupon code is required" }, 400);
  }

  if (user.subscription_status === "lifetime") {
    return c.json({ success: true, message: "You already have lifetime access!", status: "lifetime" });
  }

  const db = getDb();

  interface CouponRow { code: string; is_used: number; used_by_user_id: string | null }
  const coupon = db.query("SELECT code, is_used, used_by_user_id FROM coupons WHERE code = ? COLLATE NOCASE")
    .get(code) as CouponRow | null;

  if (!coupon) {
    return c.json({ error: "Invalid coupon code" }, 400);
  }

  if (coupon.is_used && coupon.used_by_user_id !== user.id) {
    return c.json({ error: "This coupon code has already been used" }, 400);
  }

  // Mark coupon as used and grant lifetime access
  db.run(
    "UPDATE coupons SET is_used = 1, used_by_user_id = ?, used_at = datetime('now') WHERE code = ? COLLATE NOCASE",
    [user.id, code]
  );
  db.run(
    "UPDATE users SET subscription_status = 'lifetime', updated_at = datetime('now') WHERE id = ?",
    [user.id]
  );

  return c.json({ success: true, message: "Lifetime access activated!", status: "lifetime" });
});

// ─── Refresh access token ─────────────────────────────────────────────────────

authRouter.post("/refresh", async (c) => {
  const body = await c.req.json<{ refreshToken: string }>();
  if (!body.refreshToken) return c.json({ error: "refreshToken is required" }, 400);

  const hash = createHash("sha256").update(body.refreshToken).digest("hex");
  const db = getDb();
  const row = db.query<{ id: string; user_id: string; expires_at: string }, [string]>(
    `SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = ?`
  ).get(hash);

  if (!row || new Date(row.expires_at) < new Date()) {
    if (row) db.run(`DELETE FROM refresh_tokens WHERE id = ?`, [row.id]);
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }

  const user = db.query("SELECT * FROM users WHERE id = ?").get(row.user_id) as UserRow | null;
  if (!user) return c.json({ error: "User not found" }, 401);

  // Rotate: delete old refresh token and issue a new one
  db.run(`DELETE FROM refresh_tokens WHERE id = ?`, [row.id]);
  const token = await issueToken(user.id);
  const refreshToken = await issueRefreshToken(user.id);
  return c.json({ success: true, token, refreshToken, user: userToPublic(user) });
});

// ─── Logout (invalidates refresh token) ──────────────────────────────────────

authRouter.post("/logout", async (c) => {
  const body = await c.req.json<{ refreshToken?: string }>().catch(() => ({ refreshToken: undefined }));
  if (body.refreshToken) {
    const hash = createHash("sha256").update(body.refreshToken).digest("hex");
    getDb().run(`DELETE FROM refresh_tokens WHERE token_hash = ?`, [hash]);
  }
  return c.json({ success: true });
});

// ─── Delete Account ────────────────────────────────────────────────────────────

authRouter.delete("/account", async (c) => {
  const db = getDb();
  const user = await getUserFromBearer(c.req.header("Authorization"));
  if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);
  db.run("DELETE FROM users WHERE id = ?", [user.id]);
  return c.json({ success: true });
});

export { authRouter };
