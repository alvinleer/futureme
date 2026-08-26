/**
 * FatSecret API client — calls through our backend proxy.
 *
 * FatSecret requires all calls to originate from a whitelisted IP.
 * Mobile clients can't satisfy this, so we proxy through the backend server.
 *
 * Backend routes:
 *   POST /api/fatsecret/search
 *   GET  /api/fatsecret/food/:id
 *   GET  /api/fatsecret/status
 */

import { useAuthStore } from "../state/authStore";

const BACKEND_URL = (
  process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

/** The proxy now requires a session — FatSecret bills us per call. */
const authHeaders = (): Record<string, string> => {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface FatSecretServing {
  calories: string;
  protein: string;
  carbohydrate: string;
  fat: string;
  fiber?: string;
  serving_description: string;
  metric_serving_amount?: string;
  metric_serving_unit?: string;
}

export interface FatSecretFoodResult {
  food_id: string;
  food_name: string;
  brand_name?: string;
  food_type: string; // "Brand" | "Generic"
  food_url: string;
  food_description?: string;
}

/**
 * Jaccard word-level similarity — used to rank search results.
 */
export const calculateSimilarity = (a: string, b: string): number => {
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean));

  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  const intersection = new Set([...aTokens].filter((t) => bTokens.has(t)));
  const union = new Set([...aTokens, ...bTokens]);
  return intersection.size / union.size;
};

/**
 * Search FatSecret via backend proxy.
 * Returns empty array if backend is unavailable or FatSecret is not configured.
 */
export const searchFatSecret = async (
  query: string,
  maxResults = 5
): Promise<FatSecretFoodResult[]> => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/fatsecret/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ query, maxResults }),
    });

    if (!res.ok) return [];
    const data = await res.json() as { foods: FatSecretFoodResult[] };
    return data.foods ?? [];
  } catch {
    return [];
  }
};

/**
 * Get the canonical serving nutrition for a FatSecret food ID via backend proxy.
 */
export const getFatSecretServing = async (
  foodId: string
): Promise<FatSecretServing | null> => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/fatsecret/food/${foodId}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json() as { serving: FatSecretServing | null };
    return data.serving ?? null;
  } catch {
    return null;
  }
};

/**
 * Look up a product by barcode via backend proxy.
 * Returns null if not found or FatSecret not configured.
 */
export const lookupFatSecretBarcode = async (
  barcode: string
): Promise<{
  food_id: string;
  food_name: string;
  brand_name?: string;
  serving: FatSecretServing | null;
} | null> => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/fatsecret/barcode/${barcode}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json() as { food: { food_id: string; food_name: string; brand_name?: string; serving: FatSecretServing } | null };
    return data.food ?? null;
  } catch {
    return null;
  }
};

/**
 * Check if FatSecret is available (credentials configured + IP whitelisted).
 * Always returns true since availability is determined server-side.
 */
export const isFatSecretAvailable = (): boolean => true;
