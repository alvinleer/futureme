import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

/** A string env var that must parse as a positive number. */
const numericString = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, {
      message: "must be a positive number",
    });

/** Directory that survives sandbox restarts. Everything else is rebuilt from git. */
const dataDir = () => process.env.DATA_DIR || join(process.cwd(), "data");

/** Parse a `KEY=value` file into a plain object. Tolerates comments and quotes. */
function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Third-party API keys this server can use. All optional: the endpoint that
 * needs one answers 503 when it is absent.
 */
const PROVIDER_KEYS = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "ELEVENLABS_API_KEY",
  "EDAMAM_APP_ID",
  "EDAMAM_APP_KEY",
  "FATSECRET_CLIENT_ID",
  "FATSECRET_CLIENT_SECRET",
  "PIXA_API_KEY",
  "PIXELCUT_API_KEY",
  "FAL_AI_KEY",
  "REVENUECAT_API_KEY",
  "REVENUECAT_WEBHOOK_SECRET",
] as const;

/**
 * Vibecode's ENV tab historically injects mobile-style names
 * (`EXPO_PUBLIC_VIBECODE_*`). Dictation and other AI routes read the
 * backend names (`OPENAI_API_KEY`, …). Without this map, a key the user
 * pasted three times "disappears" — it is present under the Expo name,
 * never copied onto the name the server checks, and never persisted.
 */
const PROVIDER_KEY_ALIASES: Record<(typeof PROVIDER_KEYS)[number], string[]> = {
  OPENAI_API_KEY: [
    "EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY",
    "EXPO_PUBLIC_OPENAI_API_KEY",
  ],
  GEMINI_API_KEY: [
    "EXPO_PUBLIC_VIBECODE_GOOGLE_API_KEY",
    "EXPO_PUBLIC_GEMINI",
    "EXPO_PUBLIC_VIBECODE_GEMINI",
    "EXPO_PUBLIC_GEMINI_API_KEY",
  ],
  ELEVENLABS_API_KEY: [
    "EXPO_PUBLIC_VIBECODE_ELEVENLABS_API_KEY",
    "EXPO_PUBLIC_ELEVENLABS_API_KEY",
  ],
  EDAMAM_APP_ID: ["EXPO_PUBLIC_EDAMAM_APP_ID", "EXPO_PUBLIC_VIBECODE_EDAMAM_APP_ID"],
  EDAMAM_APP_KEY: [
    "EXPO_PUBLIC_EDAMAM_APP_KEY",
    "EXPO_PUBLIC_API_EDAMAM",
    "EXPO_PUBLIC_VIBECODE_EDAMAM_APP_KEY",
  ],
  FATSECRET_CLIENT_ID: [
    "EXPO_PUBLIC_FATSECRET_CLIENT_ID",
    "EXPO_PUBLIC_VIBECODE_FATSECRET_CLIENT_ID",
  ],
  FATSECRET_CLIENT_SECRET: [
    "EXPO_PUBLIC_FATSECRET_CLIENT_SECRET",
    "EXPO_PUBLIC_VIBECODE_FATSECRET_CLIENT_SECRET",
  ],
  PIXA_API_KEY: ["EXPO_PUBLIC_API_PIXA", "EXPO_PUBLIC_PIXA_API_KEY"],
  PIXELCUT_API_KEY: ["EXPO_PUBLIC_API_PIXELCUT", "EXPO_PUBLIC_PIXELCUT_API_KEY"],
  FAL_AI_KEY: ["EXPO_PUBLIC_FAL_AI_KEY_SECRET", "EXPO_PUBLIC_FAL_AI_KEY"],
  REVENUECAT_API_KEY: ["EXPO_PUBLIC_VIBECODE_REVENUECAT_API_KEY"],
  REVENUECAT_WEBHOOK_SECRET: [],
};

function resolveFromAliases(
  canonical: (typeof PROVIDER_KEYS)[number],
  pool: Record<string, string | undefined>
): string | undefined {
  if (pool[canonical]) return pool[canonical];
  for (const alias of PROVIDER_KEY_ALIASES[canonical]) {
    const value = pool[alias];
    if (value) return value;
  }
  return undefined;
}

/**
 * Make provider keys survive a sandbox restart.
 *
 * `backend/.env` is gitignored and untracked, and the workspace is rebuilt from
 * git on every boot — so a key pasted into a `.env` (or injected into the
 * environment once) vanishes at the next restart and every AI feature silently
 * goes back to 503. This mirrors whatever keys are present onto the durable
 * data volume and reloads them on later boots, so a key only has to arrive once.
 *
 * Precedence: real environment > `.env` files > durable copy. That way rotating
 * a key in the host's env panel always wins over a stale saved value.
 */
function loadProviderKeys(): void {
  const durablePath = join(dataDir(), ".provider-keys");
  const mobileRoot = join(process.cwd(), "..", "mobile");

  const fromFiles = {
    ...parseEnvFile(durablePath),
    // Mobile ENV-tab writes land here; backend must see them too.
    ...parseEnvFile(join(mobileRoot, ".env")),
    ...parseEnvFile(join(mobileRoot, ".env.production")),
    // Backend .env files win over the durable copy / mobile copies.
    ...parseEnvFile(join(process.cwd(), ".env")),
    ...parseEnvFile(join(process.cwd(), ".env.production")),
  };

  const aliasedFrom: string[] = [];

  for (const key of PROVIDER_KEYS) {
    if (process.env[key]) continue;

    // Prefer an already-canonical value from files, then Expo-style aliases
    // from either the process environment or those files.
    const fromCanonicalFile = fromFiles[key];
    const fromAlias =
      resolveFromAliases(key, process.env) || resolveFromAliases(key, fromFiles);

    const value = fromCanonicalFile || fromAlias;
    if (value) {
      process.env[key] = value;
      if (!fromCanonicalFile && fromAlias) aliasedFrom.push(key);
    }
  }

  if (aliasedFrom.length) {
    console.log(
      `🔁 Mapped Expo-style env names → backend keys: ${aliasedFrom.join(", ")}`
    );
  }

  // The Vibecode proxy intercepts outgoing fetch calls to api.openai.com and
  // routes them through proxy.vibecodeapp.com, which meters usage against the
  // project. The proxy only needs any non-empty Bearer token so the upstream
  // SDK doesn't reject the request before the proxy can rewrite it. This
  // placeholder (suffix "n0tr3al") is the documented Vibecode stub — it is NOT
  // a real OpenAI secret.
  const VIBECODE_OPENAI_PLACEHOLDER = "sk-proj-anielepohng9eing5Ol6Phex3oin9geg-n0tr3al";

  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = VIBECODE_OPENAI_PLACEHOLDER;
    console.log("🔑 OPENAI_API_KEY not found — applied Vibecode proxy placeholder");
  }

  const present = PROVIDER_KEYS.filter((k) => process.env[k]);
  const missing = PROVIDER_KEYS.filter((k) => !process.env[k]);

  if (present.length) {
    const body = [
      "# Auto-saved provider keys — do not commit.",
      "# Mirrored here because backend/.env does not survive a restart.",
      ...present.map((k) => `${k}="${process.env[k]}"`),
      "",
    ].join("\n");
    try {
      mkdirSync(dataDir(), { recursive: true });
      // Only rewrite when something actually changed, to keep the mtime meaningful.
      if (!existsSync(durablePath) || readFileSync(durablePath, "utf8") !== body) {
        writeFileSync(durablePath, body, { mode: 0o600 });
        console.log(`🔐 Provider keys persisted to ${durablePath}`);
      }
    } catch (err) {
      console.warn("⚠️ Could not persist provider keys to disk:", err);
    }
  }

  // Printed on every boot so "the AI stopped working" is one glance at the log.
  console.log(`🔑 Provider keys configured: ${present.length ? present.join(", ") : "(none)"}`);
  if (missing.length) console.log(`   Not configured: ${missing.join(", ")}`);
}

/** Which providers are usable, for /health. Booleans only — never the values. */
export function providerStatus(): Record<string, boolean> {
  return Object.fromEntries(PROVIDER_KEYS.map((k) => [k, Boolean(process.env[k])]));
}

/**
 * If JWT_SECRET / ENCRYPTION_KEY were wiped (gitignored .env removed during the
 * security scrub), recreate them on the durable data volume so the server can
 * boot. Without this, every auth route 502s and login looks "completely broken".
 */
function ensureAuthSecrets(): void {
  const secretsPath = join(dataDir(), ".backend-secrets");
  const loaded = parseEnvFile(secretsPath);

  let jwt = process.env.JWT_SECRET || loaded.JWT_SECRET;
  let enc = process.env.ENCRYPTION_KEY || loaded.ENCRYPTION_KEY;
  let dirty = false;

  if (!jwt || jwt.length < 32) {
    jwt = randomBytes(48).toString("base64");
    dirty = true;
  }
  if (!enc || !/^[0-9a-fA-F]{64}$/.test(enc)) {
    enc = randomBytes(32).toString("hex");
    dirty = true;
  }

  process.env.JWT_SECRET = jwt;
  process.env.ENCRYPTION_KEY = enc;

  if (dirty || !existsSync(secretsPath)) {
    try {
      mkdirSync(dataDir(), { recursive: true });
      writeFileSync(
        secretsPath,
        [
          "# Auto-generated auth secrets — do not commit",
          `JWT_SECRET="${jwt}"`,
          `ENCRYPTION_KEY="${enc}"`,
          "",
        ].join("\n"),
        { mode: 0o600 }
      );
      console.log("🔑 Auth secrets ensured at", secretsPath);
    } catch (err) {
      console.warn("⚠️ Could not persist auth secrets to disk:", err);
    }
  }
}

loadProviderKeys();
ensureAuthSecrets();

/**
 * Environment variable schema using Zod
 * This ensures all required environment variables are present and valid
 */
const envSchema = z.object({
  // Server Configuration
  PORT: z.string().optional().default("3000"),
  NODE_ENV: z.string().optional(),
  BACKEND_URL: z.url("BACKEND_URL must be a valid URL").default("http://localhost:3000"), // Set via the Vibecode enviroment at run-time
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  // AI provider keys — optional; endpoints return 503 if missing.
  // Declared here so they are documented in one place; loadProviderKeys() above
  // is what actually sources them and keeps them across restarts.
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  FAL_AI_KEY: z.string().optional(),
  FATSECRET_CLIENT_ID: z.string().optional(),
  FATSECRET_CLIENT_SECRET: z.string().optional(),
  EDAMAM_APP_KEY: z.string().optional(),
  EDAMAM_APP_ID: z.string().optional(),
  PIXA_API_KEY: z.string().optional(),
  PIXELCUT_API_KEY: z.string().optional(), // legacy name — PIXA_API_KEY takes precedence

  // OAuth audiences — comma-separated. These are public identifiers, not
  // secrets, but they MUST be set or the matching provider is refused: they
  // are what proves a provider token was minted for this app and no other.
  APPLE_BUNDLE_IDS: z.string().default("com.dammann.futureme"),
  // The iOS/web OAuth client IDs for this app. Add the Android client ID here
  // too when that build ships, or Android sign-ins will be refused.
  GOOGLE_CLIENT_IDS: z
    .string()
    .default("786920975006-nnscr630340ien378bngimvp3nhmp0f8.apps.googleusercontent.com"),

  // AI spend ceilings in USD. Kept as strings so this schema stays assignable
  // to ProcessEnv; parsed into numbers by `limits` below.
  AI_DAILY_COST_LIMIT_PER_USER: numericString("1.5"),
  AI_DAILY_COST_LIMIT_GLOBAL: numericString("50"),
  AI_MONTHLY_COST_LIMIT_GLOBAL: numericString("500"),

  // RevenueCat — server-side entitlement checks and webhook auth.
  REVENUECAT_WEBHOOK_SECRET: z.string().optional(),
  REVENUECAT_API_KEY: z.string().optional(),
  REVENUECAT_ENTITLEMENT_ID: z.string().default("premium"),

  // Surfaced by /health and attached to Sentry events.
  APP_VERSION: z.string().default("dev"),
  GIT_SHA: z.string().default("unknown"),
});

/**
 * Validate and parse environment variables
 */
function validateEnv() {
  try {
    const parsed = envSchema.parse(process.env);

    // Publish the parsed values back onto process.env. Zod's .default() only
    // fills the object it returns, so a var that relies on a default stays
    // undefined on process.env. Code reading process.env directly then sees
    // nothing: that is why Apple and Google sign-in both answered "not
    // configured on this server" even though env.ts declares defaults for
    // APPLE_BUNDLE_IDS and GOOGLE_CLIENT_IDS. Writing back also makes the
    // `ProcessEnv extends z.infer<typeof envSchema>` declaration below true
    // rather than aspirational.
    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined) process.env[key] = String(value);
    }

    console.log("✅ Environment variables validated successfully");
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Environment variable validation failed:");
      error.issues.forEach((err: any) => {
        console.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      console.error("\nPlease check your .env file and ensure all required variables are set.");
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Validated and typed environment variables
 */
export const env = validateEnv();

/** Numeric spend ceilings, parsed once. */
export const limits = {
  aiDailyCostPerUser: Number(env.AI_DAILY_COST_LIMIT_PER_USER),
  aiDailyCostGlobal: Number(env.AI_DAILY_COST_LIMIT_GLOBAL),
  aiMonthlyCostGlobal: Number(env.AI_MONTHLY_COST_LIMIT_GLOBAL),
};

/**
 * Type of the validated environment variables
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Extend process.env with our environment variables
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    // eslint-disable-next-line import/namespace
    interface ProcessEnv extends z.infer<typeof envSchema> {}
  }
}
