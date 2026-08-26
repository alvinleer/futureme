/**
 * SQLite database for the nutrition intelligence layer.
 * Uses bun:sqlite — no external ORM needed.
 *
 * Tables:
 *   foods                  — canonical food records resolved from any API
 *   food_aliases           — maps messy input → canonical food (normalization layer)
 *   nutrition_cache        — persisted API results with TTL (replaces in-memory cache)
 *   user_food_preferences  — per-user input → food mapping; grows smarter over time
 *   user_logs              — raw user log events
 *   user_log_items         — individual food items per log event
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname, join } from "path";

/**
 * Resolve the database location.
 *
 * scripts/env.sh exports DATABASE_FILE (and the backup job in scripts/start
 * VACUUMs that exact path), so honouring it is what makes backups real. It
 * also keeps the live DB on the mounted data volume instead of inside the
 * source tree, where a redeploy would wipe it.
 *
 * Precedence: DATABASE_FILE → $DATA_DIR/nutrition.db → ./nutrition.db (dev).
 */
export const DB_PATH =
  process.env.DATABASE_FILE ||
  (process.env.DATA_DIR
    ? join(process.env.DATA_DIR, "nutrition.db")
    : join(import.meta.dir, "..", "nutrition.db"));

let _db: Database | null = null;

export const getDb = (): Database => {
  if (!_db) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    _db = new Database(DB_PATH);
    console.log(`[db] Using SQLite database at ${DB_PATH}`);

    // Durability & concurrency
    _db.run("PRAGMA journal_mode = WAL");       // concurrent reads during writes
    _db.run("PRAGMA foreign_keys = ON");
    _db.run("PRAGMA synchronous = NORMAL");     // fsync on WAL checkpoints only
    _db.run("PRAGMA busy_timeout = 5000");      // wait up to 5s instead of failing on lock

    // Performance — tune for hundreds/thousands of concurrent users
    _db.run("PRAGMA cache_size = -64000");      // 64 MB page cache (negative = KB)
    _db.run("PRAGMA mmap_size = 268435456");    // 256 MB memory-mapped I/O
    _db.run("PRAGMA temp_store = MEMORY");      // temp tables/indices in RAM

    initSchema(_db);
  }
  return _db;
};

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Idempotent `ALTER TABLE ... ADD COLUMN`. SQLite has no `IF NOT EXISTS` for
 * columns, so check PRAGMA table_info first.
 */
const addColumnIfMissing = (
  db: Database,
  table: string,
  column: string,
  definition: string
): void => {
  const cols = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

const initSchema = (db: Database): void => {
  // Canonical food records — all APIs resolve into this table
  db.run(`
    CREATE TABLE IF NOT EXISTS foods (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      brand             TEXT,
      is_branded        INTEGER NOT NULL DEFAULT 0,
      calories_per_100g REAL,
      protein_per_100g  REAL,
      carbs_per_100g    REAL,
      fat_per_100g      REAL,
      source            TEXT NOT NULL,
      external_id       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_foods_name ON foods (name COLLATE NOCASE)`);

  // Alias → canonical food mapping (global normalization)
  db.run(`
    CREATE TABLE IF NOT EXISTS food_aliases (
      id         TEXT PRIMARY KEY,
      alias      TEXT NOT NULL COLLATE NOCASE,
      food_id    TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
      confidence REAL NOT NULL DEFAULT 0.8,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_food_aliases_alias ON food_aliases (alias COLLATE NOCASE)`);

  // Persisted cache with TTL — survives server restarts
  db.run(`
    CREATE TABLE IF NOT EXISTS nutrition_cache (
      id         TEXT PRIMARY KEY,
      cache_key  TEXT NOT NULL UNIQUE,
      food_id    TEXT REFERENCES foods(id) ON DELETE SET NULL,
      quantity   REAL NOT NULL,
      unit       TEXT NOT NULL,
      grams      REAL,
      calories   REAL NOT NULL,
      protein    REAL NOT NULL,
      carbs      REAL NOT NULL,
      fat        REAL NOT NULL,
      source     TEXT NOT NULL,
      confidence TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_nutrition_cache_key ON nutrition_cache (cache_key)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_nutrition_cache_expires ON nutrition_cache (expires_at)`);

  // Per-user input → food preference mapping (learning layer)
  db.run(`
    CREATE TABLE IF NOT EXISTS user_food_preferences (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      input_text   TEXT NOT NULL COLLATE NOCASE,
      food_id      TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
      times_used   INTEGER NOT NULL DEFAULT 1,
      last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
      confidence   REAL NOT NULL DEFAULT 0.8,
      UNIQUE (user_id, input_text COLLATE NOCASE)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_user_pref_user ON user_food_preferences (user_id)`);

  // User log events (one per voice/camera/text log action)
  db.run(`
    CREATE TABLE IF NOT EXISTS user_logs (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL,
      original_input TEXT NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_user_logs_user ON user_logs (user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_user_logs_created ON user_logs (user_id, created_at DESC)`);

  // Individual food items within a log event
  db.run(`
    CREATE TABLE IF NOT EXISTS user_log_items (
      id               TEXT PRIMARY KEY,
      log_id           TEXT NOT NULL REFERENCES user_logs(id) ON DELETE CASCADE,
      original_text    TEXT NOT NULL,
      normalized_query TEXT NOT NULL,
      food_id          TEXT REFERENCES foods(id) ON DELETE SET NULL,
      quantity         REAL NOT NULL,
      unit             TEXT NOT NULL,
      grams            REAL,
      calories         REAL NOT NULL,
      protein          REAL NOT NULL,
      carbs            REAL NOT NULL,
      fat              REAL NOT NULL,
      confidence       TEXT NOT NULL,
      source           TEXT NOT NULL
    )
  `);

  // Weekly visualization records — stores AI-generated future self images
  db.run(`
    CREATE TABLE IF NOT EXISTS weekly_visualizations (
      id                TEXT PRIMARY KEY,
      device_id         TEXT NOT NULL,
      image_url         TEXT NOT NULL,
      progress_score    REAL NOT NULL,
      denoising_strength REAL NOT NULL,
      compliance_rate   REAL NOT NULL,
      weeks_to_goal     REAL,
      prompt_used       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at        TEXT NOT NULL
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_viz_device ON weekly_visualizations (device_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_viz_expires ON weekly_visualizations (expires_at)`);

  // ── Users & Auth ─────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id                  TEXT PRIMARY KEY,
      email               TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash       TEXT,
      display_name        TEXT,
      avatar_url          TEXT,
      auth_provider       TEXT NOT NULL DEFAULT 'email',
      provider_id         TEXT,
      subscription_status TEXT NOT NULL DEFAULT 'trial',
      trial_starts_at     TEXT NOT NULL DEFAULT (datetime('now')),
      trial_ends_at       TEXT NOT NULL DEFAULT (datetime('now', '+7 days')),
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email COLLATE NOCASE)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_provider ON users (auth_provider, provider_id)`);

  // ── Coupon codes ─────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS coupons (
      code           TEXT PRIMARY KEY COLLATE NOCASE,
      is_used        INTEGER NOT NULL DEFAULT 0,
      used_by_user_id TEXT,
      used_at        TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Refresh tokens ───────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash)`);

  // ── Federated identities ─────────────────────────────────────────────────
  // One row per (provider, verified subject). Kept separate from users so a
  // single account can hold a password *and* an Apple/Google link without the
  // users.auth_provider column having to mean two things at once.
  db.run(`
    CREATE TABLE IF NOT EXISTS user_identities (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider    TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      email       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (provider, provider_id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities (user_id)`);

  // Backfill from the legacy users.provider_id column (idempotent).
  db.run(`
    INSERT OR IGNORE INTO user_identities (id, user_id, provider, provider_id, email)
    SELECT 'legacy-' || id, id, auth_provider, provider_id, email
      FROM users
     WHERE provider_id IS NOT NULL AND auth_provider <> 'email'
  `);

  // ── AI spend ledger ──────────────────────────────────────────────────────
  // Every billable upstream AI call appends a row. The spend guard reads
  // rolling sums off this table to enforce per-user and global daily ceilings.
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      endpoint   TEXT NOT NULL,
      model      TEXT,
      input_tokens  INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd   REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ai_usage_user_time ON ai_usage (user_id, created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ai_usage_time ON ai_usage (created_at)`);

  // ── Subscription state from the store (RevenueCat) ───────────────────────
  addColumnIfMissing(db, "users", "rc_app_user_id", "TEXT");
  addColumnIfMissing(db, "users", "subscription_expires_at", "TEXT");
  addColumnIfMissing(db, "users", "subscription_product_id", "TEXT");
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_rc ON users (rc_app_user_id)`);

  // ── Meal-log fields needed to restore a device from the server ───────────
  addColumnIfMissing(db, "user_logs", "logged_at", "TEXT");
  addColumnIfMissing(db, "user_logs", "client_log_id", "TEXT");
  addColumnIfMissing(db, "user_logs", "meal_type", "TEXT");
  addColumnIfMissing(db, "user_logs", "deleted_at", "TEXT");
  db.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_logs_client
       ON user_logs (user_id, client_log_id) WHERE client_log_id IS NOT NULL`
  );
  addColumnIfMissing(db, "user_log_items", "name", "TEXT");

  // ── Visualizations are owned by an account, not a device ─────────────────
  // device_id was client-supplied and unauthenticated: anyone who guessed one
  // could read back another person's body photo. Rows are now scoped by
  // user_id; legacy rows keep their device_id and simply age out via
  // expires_at.
  addColumnIfMissing(db, "weekly_visualizations", "user_id", "TEXT");
  db.run(`CREATE INDEX IF NOT EXISTS idx_viz_user ON weekly_visualizations (user_id)`);

  // Seed the 50 TRYFUTUREME codes (idempotent — INSERT OR IGNORE)
  const seedCoupons = db.prepare(
    `INSERT OR IGNORE INTO coupons (code) VALUES (?)`
  );
  for (let i = 1; i <= 50; i++) {
    seedCoupons.run(`TRYFUTUREME${i}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Generates a simple sortable UUID-like string without crypto dependency. */
export const newId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

/** 24-hour cache TTL as ISO string. */
export const cacheTtl = (hours = 24): string =>
  new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

/** Normalize a query+quantity into a stable cache key. */
export const buildCacheKey = (query: string, quantity: number): string =>
  `${query.toLowerCase().trim().replace(/\s+/g, " ")}:${Math.round(quantity * 10) / 10}`;

/**
 * Delete expired rows from nutrition_cache and weekly_visualizations.
 * Run periodically to keep the DB lean as user count grows.
 */
export const cleanExpired = (): void => {
  const db = getDb();
  db.run(`DELETE FROM nutrition_cache WHERE expires_at < datetime('now')`);
  db.run(`DELETE FROM weekly_visualizations WHERE expires_at < datetime('now')`);
};
