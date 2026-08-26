/**
 * Backend nutrition intelligence API client.
 *
 * Wraps the three backend endpoints:
 *   batchLookup   — preference → alias → cache (DB-backed, no external API cost)
 *   storeResolved — persist newly-resolved items; updates cache + alias + preference
 *   logMeal       — record a user-confirmed meal (builds long-term learning data)
 *
 * All requests include the user's Bearer token — the backend now verifies it
 * and extracts userId from the JWT rather than trusting the request body.
 */

import { ResolvedFoodItem } from "./nutrition-types";
import { useAuthStore } from "../state/authStore";

const BACKEND_URL =
  (process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Returns Authorization header if the user is logged in. */
const authHeaders = (): Record<string, string> => {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type BackendMatchType = "preference" | "alias" | "cache";

export interface BackendHit {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: "high" | "medium" | "low";
  source: "edamam" | "fatsecret" | "gpt_estimated";
  matchType: BackendMatchType;
}

export interface StorePayloadItem {
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
  confidenceScore: number;
}

export interface LogPayloadItem {
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

// ─────────────────────────────────────────────────────────────────────────────
// API calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Batch-check the DB for each item.
 * Returns a map keyed by "normalizedQuery:quantity" → BackendHit | null.
 * Errors are swallowed — caller falls back to live API resolution.
 */
export const batchLookup = async (
  userId: string,
  items: Array<{ query: string; quantity: number }>
): Promise<Record<string, BackendHit | null>> => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/nutrition/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ userId, items }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return data.results ?? {};
  } catch {
    return {};
  }
};

/**
 * Persist newly-resolved items to the DB (fire-and-forget safe).
 * Updates foods, nutrition_cache, food_aliases, and user_food_preferences.
 */
export const storeResolved = async (
  userId: string,
  items: StorePayloadItem[]
): Promise<void> => {
  try {
    await fetch(`${BACKEND_URL}/api/nutrition/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ userId, items }),
    });
  } catch {
    // Non-critical — in-memory cache still works
  }
};

/**
 * Record a user-confirmed meal log. Call this when the user taps "Log It".
 * Builds the historical data used for preference learning.
 */
export const logMeal = async (
  userId: string,
  input: string,
  items: LogPayloadItem[]
): Promise<void> => {
  try {
    await fetch(`${BACKEND_URL}/api/nutrition/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ userId, input, items }),
    });
  } catch {
    // Non-critical
  }
};

/**
 * Convert a ResolvedFoodItem into a StorePayloadItem for the backend.
 */
export const toStorePayload = (
  item: ResolvedFoodItem,
  normalizedQuery: string,
  parseConfidence: number
): StorePayloadItem => ({
  name: item.name,
  originalText: item.original_text,
  normalizedQuery,
  quantity: item.quantity,
  unit: item.unit,
  calories: item.calories,
  protein: item.protein,
  carbs: item.carbs,
  fat: item.fat,
  confidence: item.confidence,
  source: item.source,
  confidenceScore: parseConfidence,
});
