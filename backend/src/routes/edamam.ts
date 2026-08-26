import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";

const edamamRouter = new Hono();
edamamRouter.use("*", requireAuth);

const FOOD_PARSER_URL = "https://api.edamam.com/api/food-database/v2/parser";
const FOOD_NUTRIENTS_URL = "https://api.edamam.com/api/food-database/v2/nutrients";

const getCredentials = () => ({
  appId: process.env.EDAMAM_APP_ID,
  appKey: process.env.EDAMAM_APP_KEY,
});

// ─── Food parser ──────────────────────────────────────────────────────────────

const parseQuerySchema = z.object({ ingredient: z.string().min(1).max(500) });

edamamRouter.get("/parse", zValidator("query", parseQuerySchema), async (c) => {
  const { appId, appKey } = getCredentials();
  if (!appId || !appKey) return c.json({ error: "Edamam API not configured" }, 503);

  const { ingredient } = c.req.valid("query");

  const url = `${FOOD_PARSER_URL}?app_id=${appId}&app_key=${appKey}&ingr=${encodeURIComponent(ingredient)}&nutrition-type=logging`;
  const res = await fetch(url);

  if (!res.ok) return c.json({ error: await res.text() }, res.status as 400);
  return c.json(await res.json() as Record<string, unknown>);
});

// ─── Nutrients lookup ─────────────────────────────────────────────────────────

const nutrientsSchema = z.object({
  ingredients: z.array(z.object({
    quantity: z.number(),
    measureURI: z.string(),
    qualifiers: z.array(z.string()).optional(),
    foodId: z.string(),
  })).min(1).max(50),
});

edamamRouter.post("/nutrients", zValidator("json", nutrientsSchema), async (c) => {
  const { appId, appKey } = getCredentials();
  if (!appId || !appKey) return c.json({ error: "Edamam API not configured" }, 503);

  const body = c.req.valid("json");
  const url = `${FOOD_NUTRIENTS_URL}?app_id=${appId}&app_key=${appKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) return c.json({ error: await res.text() }, res.status as 400);
  return c.json(await res.json() as Record<string, unknown>);
});

export { edamamRouter };
