/**
 * FatSecret Platform REST API — backend proxy.
 *
 * FatSecret requires calls from a whitelisted IP. Mobile clients cannot call
 * FatSecret directly, so all calls are proxied through this backend.
 *
 * Endpoints:
 *   POST /api/fatsecret/search  — search foods
 *   GET  /api/fatsecret/food/:id — get nutrition for a food ID
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { readFileSync } from "fs";
import { requireAuth } from "../middleware/auth";

const fatsecretRouter = new Hono();

// FatSecret bills per call and only answers from our whitelisted IP, which
// makes an unauthenticated proxy a free food-database for anyone who finds it.
fatsecretRouter.use("*", requireAuth);
const TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
const API_URL = "https://platform.fatsecret.com/rest/server.api";

// ─── Credential resolution ────────────────────────────────────────────────────
// The Vibecode backend process receives only Vibecode-managed env vars.
// We read credentials from the mobile .env as a fallback since that's where
// the user stores FatSecret keys (via the Vibecode ENV tab with EXPO_PUBLIC_ prefix).

const parseEnvFile = (path: string): Record<string, string> => {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => {
          const idx = l.indexOf("=");
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        })
    );
  } catch { return {}; }
};

const mobileEnv = parseEnvFile("/home/user/workspace/mobile/.env");

const getClientId = (): string | undefined =>
  process.env.FATSECRET_CLIENT_ID ??
  process.env.EXPO_PUBLIC_FATSECRET_CLIENT_ID ??
  mobileEnv["EXPO_PUBLIC_FATSECRET_CLIENT_ID"] ??
  mobileEnv["FATSECRET_CLIENT_ID"];

const getClientSecret = (): string | undefined =>
  process.env.FATSECRET_CLIENT_SECRET ??
  process.env.EXPO_PUBLIC_FATSECRET_CLIENT_SECRET ??
  mobileEnv["EXPO_PUBLIC_FATSECRET_CLIENT_SECRET"] ??
  mobileEnv["FATSECRET_CLIENT_SECRET"];

// ─── Token cache ─────────────────────────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

const getToken = async (): Promise<string | null> => {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!clientId || !clientSecret) return null;

  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=basic",
  });

  if (!res.ok) return null;
  const data = await res.json() as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
};

// ─── Search ──────────────────────────────────────────────────────────────────

const searchSchema = z.object({
  query: z.string().min(1).max(200),
  maxResults: z.number().int().min(1).max(50).optional(),
});

fatsecretRouter.post("/search", zValidator("json", searchSchema), async (c) => {
  const { query, maxResults = 5 } = c.req.valid("json");

  const token = await getToken();
  if (!token) return c.json({ error: "FatSecret not configured" }, 503);

  const params = new URLSearchParams({
    method: "foods.search",
    search_expression: query,
    max_results: String(maxResults),
    format: "json",
  });

  const res = await fetch(`${API_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return c.json({ foods: [] });

  const data = await res.json() as { foods?: { food?: unknown }; error?: { code: number; message: string } };

  if (data.error) {
    console.error("[FatSecret] Search error:", data.error);
    return c.json({ foods: [], error: data.error.message });
  }

  const foods = data?.foods?.food;
  if (!foods) return c.json({ foods: [] });

  return c.json({ foods: Array.isArray(foods) ? foods : [foods] });
});

// ─── Get food ────────────────────────────────────────────────────────────────

fatsecretRouter.get("/food/:id", async (c) => {
  const foodId = c.req.param("id");
  const token = await getToken();
  if (!token) return c.json({ error: "FatSecret not configured" }, 503);

  const params = new URLSearchParams({
    method: "food.get.v2",
    food_id: foodId,
    format: "json",
  });

  const res = await fetch(`${API_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return c.json({ serving: null });

  const data = await res.json() as { food?: { servings?: { serving?: unknown } }; error?: { code: number; message: string } };

  if (data.error) {
    console.error("[FatSecret] Food get error:", data.error);
    return c.json({ serving: null, error: data.error.message });
  }

  const servings = data?.food?.servings?.serving;
  if (!servings) return c.json({ serving: null });

  // Return first serving (usually per-serving canonical unit)
  const serving = Array.isArray(servings) ? servings[0] : servings;
  return c.json({ serving });
});

// ─── Barcode lookup ──────────────────────────────────────────────────────────

fatsecretRouter.get("/barcode/:barcode", async (c) => {
  const barcode = c.req.param("barcode");
  const token = await getToken();
  if (!token) return c.json({ error: "FatSecret not configured" }, 503);

  // Step 1: resolve barcode → food_id
  const barcodeParams = new URLSearchParams({
    method: "food.find_id_for_barcode",
    barcode,
    format: "json",
  });

  const barcodeRes = await fetch(`${API_URL}?${barcodeParams}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!barcodeRes.ok) return c.json({ food: null });

  const barcodeData = await barcodeRes.json() as { food_id?: { value?: string }; error?: { code: number; message: string } };

  if (barcodeData.error) {
    console.error("[FatSecret] Barcode lookup error:", barcodeData.error);
    return c.json({ food: null });
  }

  const foodId = barcodeData?.food_id?.value;
  if (!foodId) return c.json({ food: null });

  // Step 2: get nutrition for that food_id
  const foodParams = new URLSearchParams({
    method: "food.get.v2",
    food_id: foodId,
    format: "json",
  });

  const foodRes = await fetch(`${API_URL}?${foodParams}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!foodRes.ok) return c.json({ food: null });

  const foodData = await foodRes.json() as {
    food?: {
      food_name?: string;
      brand_name?: string;
      servings?: { serving?: unknown };
    };
    error?: { code: number; message: string };
  };

  if (foodData.error || !foodData.food) return c.json({ food: null });

  const servings = foodData.food.servings?.serving;
  const serving = Array.isArray(servings) ? servings[0] : servings;

  return c.json({
    food: {
      food_id: foodId,
      food_name: foodData.food.food_name ?? "Unknown Food",
      brand_name: foodData.food.brand_name,
      serving,
    },
  });
});

// ─── Health check (for testing) ──────────────────────────────────────────────

fatsecretRouter.get("/status", async (c) => {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!clientId || !clientSecret) {
    return c.json({ available: false, reason: "credentials not configured" });
  }
  const token = await getToken();
  return c.json({ available: !!token, ip_ok: !!token });
});

export { fatsecretRouter };
