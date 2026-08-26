/**
 * Minimal OIDC ID-token verifier (JWKS + RS256/ES256) built on Web Crypto.
 *
 * Used to prove that an OAuth sign-in actually came from the provider rather
 * than from a client that simply posted an email address. Apple and Google
 * both publish a JWKS document; we fetch it (cached), pick the key matching
 * the token's `kid`, verify the signature, then check iss / aud / exp / nbf.
 */

interface Jwk {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
}

export interface IdTokenClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat: number;
  nbf?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  is_private_email?: boolean | string;
}

export class OidcError extends Error {}

// ── JWKS cache ────────────────────────────────────────────────────────────────

const JWKS_TTL_MS = 60 * 60 * 1000; // Apple/Google rotate keys slowly; 1h is safe.

const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

async function fetchJwks(url: string, force = false): Promise<Jwk[]> {
  const cached = jwksCache.get(url);
  if (!force && cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) {
    return cached.keys;
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    // Serve a stale copy rather than locking every user out on a blip.
    if (cached) return cached.keys;
    throw new OidcError(`Could not fetch JWKS from ${url} (${res.status})`);
  }
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = body.keys ?? [];
  jwksCache.set(url, { keys, fetchedAt: Date.now() });
  return keys;
}

// ── Encoding helpers ──────────────────────────────────────────────────────────

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as T;
}

/**
 * Web Crypto's algorithm/JWK types are not exposed as globals under this
 * tsconfig, so the parameter objects are threaded through as `any`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function algParams(alg: string): { importAlg: any; verifyAlg: any } {
  switch (alg) {
    case "RS256":
      return {
        importAlg: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        verifyAlg: { name: "RSASSA-PKCS1-v1_5" },
      };
    case "ES256":
      return {
        importAlg: { name: "ECDSA", namedCurve: "P-256" },
        verifyAlg: { name: "ECDSA", hash: "SHA-256" },
      };
    default:
      throw new OidcError(`Unsupported token algorithm: ${alg}`);
  }
}

// ── Verification ──────────────────────────────────────────────────────────────

export interface VerifyOptions {
  jwksUri: string;
  /** Accepted `iss` values. */
  issuers: string[];
  /** Accepted `aud` values — the OAuth client / bundle IDs we own. */
  audiences: string[];
  /** Allowed clock skew in seconds. */
  clockToleranceSec?: number;
  /** When set, the token's `nonce` claim must match exactly. */
  nonce?: string;
}

/**
 * Verifies an OIDC ID token and returns its claims.
 * Throws OidcError on any signature, issuer, audience, or expiry failure.
 */
export async function verifyIdToken(token: string, opts: VerifyOptions): Promise<IdTokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new OidcError("Malformed ID token");
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let header: { alg: string; kid?: string };
  let claims: IdTokenClaims;
  try {
    header = decodeSegment(headerB64);
    claims = decodeSegment(payloadB64);
  } catch {
    throw new OidcError("Malformed ID token");
  }

  if (opts.audiences.length === 0) {
    throw new OidcError("No audience configured for this provider");
  }

  const { importAlg, verifyAlg } = algParams(header.alg);

  // Refetch the JWKS once if the kid is unknown — covers key rotation.
  let keys = await fetchJwks(opts.jwksUri);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await fetchJwks(opts.jwksUri, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new OidcError("Signing key not found in provider JWKS");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const key = await crypto.subtle.importKey("jwk", jwk as any, importAlg, false, ["verify"]);
  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToBytes(signatureB64);

  const valid = await crypto.subtle.verify(verifyAlg, key, signature, signed);
  if (!valid) throw new OidcError("ID token signature verification failed");

  // ── Claim checks ──
  const skew = opts.clockToleranceSec ?? 60;
  const now = Math.floor(Date.now() / 1000);

  if (!opts.issuers.includes(claims.iss)) {
    throw new OidcError("ID token issuer mismatch");
  }

  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.some((a) => opts.audiences.includes(a))) {
    throw new OidcError("ID token audience mismatch");
  }

  if (typeof claims.exp !== "number" || claims.exp + skew < now) {
    throw new OidcError("ID token has expired");
  }
  if (typeof claims.nbf === "number" && claims.nbf - skew > now) {
    throw new OidcError("ID token is not yet valid");
  }
  if (!claims.sub) throw new OidcError("ID token is missing a subject");

  if (opts.nonce !== undefined && claims.nonce !== opts.nonce) {
    throw new OidcError("ID token nonce mismatch");
  }

  return claims;
}

// ── Provider presets ──────────────────────────────────────────────────────────

export const APPLE_JWKS_URI = "https://appleid.apple.com/auth/keys";
export const APPLE_ISSUERS = ["https://appleid.apple.com"];

export const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** Comma-separated env list → trimmed, non-empty array. */
export function audienceList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
