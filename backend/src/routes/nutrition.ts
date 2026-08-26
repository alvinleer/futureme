/**
 * Nutrition intelligence API routes.
 *
 * POST /api/nutrition/lookup  — check user preferences → aliases → cache
 * POST /api/nutrition/store   — persist resolved items to foods + cache + preferences
 * POST /api/nutrition/log     — record a confirmed meal log
 *
 * All routes require a valid Bearer JWT token (userId extracted from token).
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getDb, newId, cacheTtl, buildCacheKey } from "../db";
import { requireAuth } from "../middleware/auth";
import { encrypt } from "../encryption";

type AppEnv = { Variables: { userId: string } };
const nutritionRouter = new Hono<AppEnv>();

// Apply auth middleware to all nutrition routes
nutritionRouter.use("*", requireAuth);

// ─────────────────────────────────────────────────────────────────────────────
// POST /lookup
// Checks 3 layers in priority order: user preference > global alias > cache
// Returns a result map keyed by "query:quantity"
// ─────────────────────────────────────────────────────────────────────────────

const lookupSchema = z.object({
  items: z.array(z.object({
    query: z.string().min(1).max(200),
    quantity: z.number().positive(),
  })).min(1).max(50),
});

nutritionRouter.post("/lookup", zValidator("json", lookupSchema), async (c) => {
  const userId = c.get("userId") as string;
  const body = c.req.valid("json");

  const db = getDb();
  const now = new Date().toISOString();
  const results: Record<string, ResolvedResult | null> = {};

  for (const item of body.items) {
    const key = buildCacheKey(item.query, item.quantity);
    let resolved: ResolvedResult | null = null;

    // ── Layer 1: User preference ──────────────────────────────────────────────
    const pref = db
      .query<UserPrefRow, [string, string]>(
        `SELECT ufp.times_used, ufp.confidence as pref_confidence,
                f.name, f.is_branded, f.source,
                nc.calories, nc.protein, nc.carbs, nc.fat,
                nc.unit, nc.quantity, nc.confidence
         FROM user_food_preferences ufp
         JOIN foods f ON f.id = ufp.food_id
         LEFT JOIN nutrition_cache nc ON nc.food_id = ufp.food_id
           AND nc.quantity = ?2 AND nc.expires_at > ?1
         WHERE ufp.user_id = ?1 AND ufp.input_text = ?2 COLLATE NOCASE
         ORDER BY ufp.times_used DESC
         LIMIT 1`
      )
      .get(userId, item.query);

    if (pref?.calories != null) {
      resolved = {
        name: pref.name,
        calories: pref.calories ?? 0,
        protein: pref.protein ?? 0,
        carbs: pref.carbs ?? 0,
        fat: pref.fat ?? 0,
        confidence: (pref.confidence ?? "medium") as "high" | "medium" | "low",
        source: pref.source as "edamam" | "fatsecret" | "gpt_estimated",
        matchType: "preference",
      };
    }

    // ── Layer 2: Global alias ─────────────────────────────────────────────────
    if (!resolved) {
      const alias = db
        .query<AliasRow, [string, string, number]>(
          `SELECT f.name, f.source,
                  nc.calories, nc.protein, nc.carbs, nc.fat,
                  nc.unit, nc.quantity, nc.confidence
           FROM food_aliases fa
           JOIN foods f ON f.id = fa.food_id
           LEFT JOIN nutrition_cache nc ON nc.food_id = fa.food_id
             AND nc.quantity = ?3 AND nc.expires_at > ?1
           WHERE fa.alias = ?2 COLLATE NOCASE
           LIMIT 1`
        )
        .get(now, item.query, item.quantity);

      if (alias?.calories != null) {
        resolved = {
          name: alias.name,
          calories: alias.calories ?? 0,
          protein: alias.protein ?? 0,
          carbs: alias.carbs ?? 0,
          fat: alias.fat ?? 0,
          confidence: (alias.confidence ?? "medium") as "high" | "medium" | "low",
          source: alias.source as "edamam" | "fatsecret" | "gpt_estimated",
          matchType: "alias",
        };
      }
    }

    // ── Layer 3: Nutrition cache ──────────────────────────────────────────────
    if (!resolved) {
      const cached = db
        .query<CacheRow, [string, string]>(
          `SELECT f.name, nc.calories, nc.protein, nc.carbs, nc.fat,
                  nc.confidence, nc.source
           FROM nutrition_cache nc
           LEFT JOIN foods f ON f.id = nc.food_id
           WHERE nc.cache_key = ?2 AND nc.expires_at > ?1
           LIMIT 1`
        )
        .get(now, key);

      if (cached) {
        resolved = {
          name: cached.name ?? item.query,
          calories: cached.calories,
          protein: cached.protein,
          carbs: cached.carbs,
          fat: cached.fat,
          confidence: cached.confidence as "high" | "medium" | "low",
          source: cached.source as "edamam" | "fatsecret" | "gpt_estimated",
          matchType: "cache",
        };
      }
    }

    results[key] = resolved;
  }

  return c.json({ results });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /store
// Persists newly-resolved items into foods + nutrition_cache + food_aliases
// + upserts user_food_preferences
// ─────────────────────────────────────────────────────────────────────────────

const storeItemSchema = z.object({
  name: z.string().min(1).max(200),
  originalText: z.string().min(1).max(500),
  normalizedQuery: z.string().min(1).max(200),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(50),
  grams: z.number().positive().optional(),
  calories: z.number().min(0),
  protein: z.number().min(0),
  carbs: z.number().min(0),
  fat: z.number().min(0),
  confidence: z.string(),
  source: z.string(),
  is_branded: z.boolean().optional(),
  confidenceScore: z.number().min(0).max(1),
});

nutritionRouter.post("/store", zValidator("json", z.object({ items: z.array(storeItemSchema).min(1).max(50) })), async (c) => {
  const userId = c.get("userId") as string;
  const body = c.req.valid("json");

  const db = getDb();

  for (const item of body.items) {
    // 1. Upsert into foods table
    let foodId: string | null = null;

    const existingFood = db
      .query<{ id: string }, [string]>(
        `SELECT id FROM foods WHERE name = ? COLLATE NOCASE LIMIT 1`
      )
      .get(item.name);

    if (existingFood) {
      foodId = existingFood.id;
      // Update nutrition per 100g if we have weight info
      if (item.grams && item.grams > 0) {
        const scale = 100 / item.grams;
        db.run(
          `UPDATE foods SET
            calories_per_100g = ?, protein_per_100g = ?,
            carbs_per_100g = ?, fat_per_100g = ?,
            source = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [
            item.calories * scale,
            item.protein * scale,
            item.carbs * scale,
            item.fat * scale,
            item.source,
            foodId,
          ]
        );
      }
    } else {
      foodId = newId();
      const scale = item.grams && item.grams > 0 ? 100 / item.grams : null;
      db.run(
        `INSERT INTO foods (id, name, is_branded, calories_per_100g, protein_per_100g,
          carbs_per_100g, fat_per_100g, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          foodId,
          item.name,
          item.is_branded ? 1 : 0,
          scale ? item.calories * scale : null,
          scale ? item.protein * scale : null,
          scale ? item.carbs * scale : null,
          scale ? item.fat * scale : null,
          item.source,
        ]
      );
    }

    // 2. Upsert nutrition_cache entry
    const cacheKey = buildCacheKey(item.normalizedQuery, item.quantity);
    db.run(
      `INSERT INTO nutrition_cache
         (id, cache_key, food_id, quantity, unit, grams, calories, protein, carbs, fat, source, confidence, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         calories = excluded.calories, protein = excluded.protein,
         carbs = excluded.carbs, fat = excluded.fat,
         source = excluded.source, confidence = excluded.confidence,
         expires_at = excluded.expires_at`,
      [
        newId(),
        cacheKey,
        foodId,
        item.quantity,
        item.unit,
        item.grams ?? null,
        item.calories,
        item.protein,
        item.carbs,
        item.fat,
        item.source,
        item.confidence,
        // DB-sourced items cached for 1 year; GPT estimates cached for 30 days
        item.source === "gpt_estimated" ? cacheTtl(30 * 24) : cacheTtl(365 * 24),
      ]
    );

    // 3. Upsert food alias (input_text → food)
    const aliasText = item.originalText.toLowerCase().trim();
    if (aliasText && aliasText !== item.name.toLowerCase()) {
      db.run(
        `INSERT INTO food_aliases (id, alias, food_id, confidence)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(alias) DO UPDATE SET food_id = excluded.food_id, confidence = excluded.confidence`,
        [newId(), aliasText, foodId, item.confidenceScore]
      );
    }

    // 4. Upsert user food preference
    db.run(
      `INSERT INTO user_food_preferences (id, user_id, input_text, food_id, times_used, last_used_at, confidence)
       VALUES (?, ?, ?, ?, 1, datetime('now'), ?)
       ON CONFLICT(user_id, input_text) DO UPDATE SET
         times_used = times_used + 1,
         last_used_at = datetime('now'),
         food_id = excluded.food_id,
         confidence = excluded.confidence`,
      [newId(), userId, aliasText, foodId, item.confidenceScore]
    );
  }

  return c.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /log
// Records a confirmed meal log and its individual items.
// original_input and original_text are encrypted at rest.
// ─────────────────────────────────────────────────────────────────────────────

const logItemSchema = z.object({
  name: z.string().min(1).max(200),
  originalText: z.string().min(1).max(500),
  normalizedQuery: z.string().min(1).max(200),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(50),
  grams: z.number().positive().optional(),
  calories: z.number().min(0),
  protein: z.number().min(0),
  carbs: z.number().min(0),
  fat: z.number().min(0),
  confidence: z.string(),
  source: z.string(),
});

nutritionRouter.post("/log", zValidator("json", z.object({
  input: z.string().min(1).max(2000),
  items: z.array(logItemSchema).min(1).max(50),
})), async (c) => {
  const userId = c.get("userId") as string;
  const body = c.req.valid("json");

  const db = getDb();
  const logId = newId();

  // Encrypt the raw voice/text input before storing
  const encryptedInput = encrypt(body.input);

  db.run(
    `INSERT INTO user_logs (id, user_id, original_input) VALUES (?, ?, ?)`,
    [logId, userId, encryptedInput]
  );

  for (const item of body.items) {
    const food = db
      .query<{ id: string }, [string]>(
        `SELECT id FROM foods WHERE name = ? COLLATE NOCASE LIMIT 1`
      )
      .get(item.name);

    // Encrypt the original text for each item
    const encryptedOriginalText = encrypt(item.originalText);

    db.run(
      `INSERT INTO user_log_items
         (id, log_id, original_text, normalized_query, food_id, quantity, unit, grams,
          calories, protein, carbs, fat, confidence, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        logId,
        encryptedOriginalText,
        item.normalizedQuery,
        food?.id ?? null,
        item.quantity,
        item.unit,
        item.grams ?? null,
        item.calories,
        item.protein,
        item.carbs,
        item.fat,
        item.confidence,
        item.source,
      ]
    );
  }

  return c.json({ logId });
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ResolvedResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: "high" | "medium" | "low";
  source: "edamam" | "fatsecret" | "gpt_estimated";
  matchType: "preference" | "alias" | "cache";
}

interface StoreItem {
  name: string;
  originalText: string;
  normalizedQuery: string;
  quantity: number;
  unit: string;
  grams?: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: string;
  source: string;
  is_branded?: boolean;
  confidenceScore: number; // 0-1 float from parse layer
}

interface LogItem {
  name: string;
  originalText: string;
  normalizedQuery: string;
  quantity: number;
  unit: string;
  grams?: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: string;
  source: string;
}

// SQLite row types (bun:sqlite returns plain objects)
type UserPrefRow = {
  name: string; source: string; times_used: number; pref_confidence: number;
  calories: number | null; protein: number | null; carbs: number | null; fat: number | null;
  unit: string | null; quantity: number | null; confidence: string | null;
};
type AliasRow = {
  name: string; source: string;
  calories: number | null; protein: number | null; carbs: number | null; fat: number | null;
  unit: string | null; quantity: number | null; confidence: string | null;
};
type CacheRow = {
  name: string | null;
  calories: number; protein: number; carbs: number; fat: number;
  confidence: string; source: string;
};

export { nutritionRouter };
