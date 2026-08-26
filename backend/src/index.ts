import "@vibecodeapp/proxy"; // DO NOT REMOVE OTHERWISE VIBECODE PROXY WILL NOT WORK
import { Hono } from "hono";
import { cors } from "hono/cors";
import "./env";
import { providerStatus } from "./env";
import { sampleRouter } from "./routes/sample";
import { nutritionRouter } from "./routes/nutrition";
import { fatsecretRouter } from "./routes/fatsecret";
import { visualizationRouter } from "./routes/visualization";
import { authRouter } from "./routes/auth";
import { aiRouter } from "./routes/ai";
import { edamamRouter } from "./routes/edamam";
import { imagesRouter } from "./routes/images";
import { logger } from "hono/logger";
import { cleanExpired } from "./db";

const app = new Hono();

// ── Security headers ──────────────────────────────────────────────────────────
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Permitted-Cross-Domain-Policies", "none");
});

// ── CORS — validates origin against allowlist ─────────────────────────────────
const allowed = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.dev\.vibecode\.run$/,
  /^https:\/\/[a-z0-9-]+\.vibecode\.run$/,
];

app.use(
  "*",
  cors({
    origin: (origin) => (origin && allowed.some((re) => re.test(origin)) ? origin : null),
    credentials: true,
  })
);

// ── Logging ───────────────────────────────────────────────────────────────────
app.use("*", logger());

// ── Health check ──────────────────────────────────────────────────────────────
// `providers` reports which API keys the server can see — booleans only, never
// values. This is the fastest way to tell "the key never arrived" apart from
// "the key is wrong", instead of guessing from a 503 in the app.
app.get("/health", (c) => c.json({ status: "ok", providers: providerStatus() }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.route("/api/sample", sampleRouter);
app.route("/api/nutrition", nutritionRouter);
app.route("/api/fatsecret", fatsecretRouter);
app.route("/api/visualization", visualizationRouter);
app.route("/api/auth", authRouter);
app.route("/api/ai", aiRouter);
app.route("/api/edamam", edamamRouter);
app.route("/api/images", imagesRouter);

// ── Scheduled maintenance ─────────────────────────────────────────────────────
// Clean expired cache rows every 6 hours to keep the DB lean at scale.
setInterval(() => {
  try {
    cleanExpired();
    console.log("[Maintenance] Expired cache rows cleaned");
  } catch (err) {
    console.error("[Maintenance] Cleanup error:", err);
  }
}, 6 * 60 * 60 * 1000).unref();

// Run once on startup
try { cleanExpired(); } catch { /* ignore on first boot */ }

const port = Number(process.env.PORT) || 3000;

export default {
  port,
  fetch: app.fetch,
};
