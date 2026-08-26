/**
 * Nutrition Routing Orchestrator
 *
 * Pipeline for each food item:
 *   1. Check cache
 *   2. Route: branded → FatSecret first, generic → Edamam first
 *   3. Fallback: try secondary API
 *   4. Fallback: GPT refines query, retry both APIs
 *   5. Final fallback: GPT nutrition estimation (marked LOW confidence)
 *
 * Public API:
 *   analyzeNutritionAdvanced(input) — full pipeline from raw text
 */

import { ParsedFoodItem, ResolvedFoodItem, NutritionAnalysisResult, ConfidenceLevel } from "./nutrition-types";
import { Meal } from "../types/diet";
import { parseFoodInput } from "./nutrition-parser";
import { getFromCache, setInCache } from "./nutrition-cache";
import {
  searchFatSecret,
  getFatSecretServing,
  isFatSecretAvailable,
  calculateSimilarity,
} from "./fatsecret";
import { analyzeFoodItem } from "./edamam-nutrition";
import { getOpenAITextResponse } from "./chat-service";
import { batchLookup, storeResolved, toStorePayload } from "./nutrition-api";
import { getDeviceId } from "./device-id";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

const buildEdamamQuery = (item: ParsedFoodItem): string => {
  if (item.estimated_grams) {
    return `${item.estimated_grams}g ${item.normalized_query}`;
  }
  if (item.unit !== "serving") {
    return `${item.quantity} ${item.unit} ${item.normalized_query}`;
  }
  return item.normalized_query;
};

/** Try Edamam Food Database API for a parsed item. */
const tryEdamam = async (item: ParsedFoodItem): Promise<ResolvedFoodItem | null> => {
  try {
    const query = buildEdamamQuery(item);
    const nutrition = await analyzeFoodItem(query);

    // Edamam returns zeros when it can't find the item
    if (!nutrition || (nutrition.calories === 0 && nutrition.protein === 0)) {
      return null;
    }

    return {
      name: item.normalized_query,
      original_text: item.original_text,
      quantity: item.quantity,
      unit: item.unit,
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fat: nutrition.fat,
      fiber: nutrition.fiber,
      confidence: "high",
      source: "edamam",
      micronutrients: nutrition.micronutrients,
    };
  } catch {
    return null;
  }
};

/** Try FatSecret API for a parsed item. Requires configured credentials. */
const tryFatSecret = async (item: ParsedFoodItem): Promise<ResolvedFoodItem | null> => {
  if (!isFatSecretAvailable()) return null;

  try {
    const results = await searchFatSecret(item.normalized_query, 5);
    if (!results.length) return null;

    // Filter to English/Latin-character food names only to avoid foreign language results
    const englishResults = results.filter((r) =>
      /^[\x20-\x7E\u00C0-\u024F]+$/.test(r.food_name)
    );
    if (!englishResults.length) return null;

    // Select best match using Jaccard word similarity
    let bestMatch = englishResults[0];
    let bestScore = calculateSimilarity(item.normalized_query, englishResults[0].food_name);

    for (const candidate of englishResults.slice(1)) {
      const score = calculateSimilarity(item.normalized_query, candidate.food_name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    // Require at least some overlap to avoid completely wrong matches
    if (bestScore < 0.15) return null;

    const serving = await getFatSecretServing(bestMatch.food_id);
    if (!serving) return null;

    const confidence: ConfidenceLevel =
      bestScore >= 0.7 ? "high" : bestScore >= 0.4 ? "medium" : "low";

    const cal = parseFloat(serving.calories) || 0;
    const pro = parseFloat(serving.protein) || 0;
    const carb = parseFloat(serving.carbohydrate) || 0;
    const fat = parseFloat(serving.fat) || 0;
    const fiber = serving.fiber ? parseFloat(serving.fiber) : undefined;

    // Determine the correct multiplier.
    //
    // FatSecret returns macros for one serving. If the user specified a weight
    // (unit "g" or "ml"), we must scale by (requested grams / serving grams)
    // rather than by item.quantity (which would be e.g. 100 for "100g", making
    // everything 100× too high).
    let scale: number;
    const isWeightUnit = item.unit === "g" || item.unit === "ml";
    const metricAmount = serving.metric_serving_amount ? parseFloat(serving.metric_serving_amount) : null;
    const metricUnit = serving.metric_serving_unit?.toLowerCase();

    if (isWeightUnit && item.estimated_grams && metricAmount && metricAmount > 0 && (metricUnit === "g" || metricUnit === "ml")) {
      // Scale by requested grams / serving grams
      scale = item.estimated_grams / metricAmount;
    } else if (isWeightUnit && item.estimated_grams && metricAmount && metricAmount > 0) {
      // Metric unit is something else (oz, etc.) — best effort using item.estimated_grams
      scale = item.estimated_grams / (metricAmount * 28.35); // assume oz
    } else {
      // Serving-based query (pieces, cups, tbsp, etc.) — use quantity directly
      scale = item.quantity;
    }

    return {
      name: bestMatch.food_name,
      original_text: item.original_text,
      quantity: item.quantity,
      unit: item.unit,
      calories: Math.round(cal * scale),
      protein: Math.round(pro * scale * 10) / 10,
      carbs: Math.round(carb * scale * 10) / 10,
      fat: Math.round(fat * scale * 10) / 10,
      fiber: fiber !== undefined ? Math.round(fiber * scale * 10) / 10 : undefined,
      confidence,
      source: "fatsecret",
    };
  } catch {
    return null;
  }
};

/**
 * Ask GPT to refine the search query, then retry both APIs.
 * Used when both primary and secondary APIs return no result.
 */
const tryWithRefinedQuery = async (item: ParsedFoodItem): Promise<ResolvedFoodItem | null> => {
  try {
    const refinePrompt = [
      {
        role: "user" as const,
        content: `The food item "${item.normalized_query}" returned no results from nutrition databases. Suggest a single, cleaner search query for this food. Reply with ONLY the query text, nothing else.`,
      },
    ];
    const refineResponse = await getOpenAITextResponse(refinePrompt, { temperature: 0.1, maxTokens: 30 });

    const refinedQuery = refineResponse.content.trim().replace(/['"]/g, "");
    if (!refinedQuery || refinedQuery === item.normalized_query) return null;

    const refinedItem: ParsedFoodItem = { ...item, normalized_query: refinedQuery };

    if (item.is_branded) {
      return (await tryFatSecret(refinedItem)) ?? (await tryEdamam(refinedItem));
    }
    return (await tryEdamam(refinedItem)) ?? (await tryFatSecret(refinedItem));
  } catch {
    return null;
  }
};

/**
 * GPT nutrition estimation — LAST RESORT only.
 * Always returns a result but marked as LOW confidence.
 * GPT estimates only calories, protein, carbs, fat.
 */
const estimateWithGPT = async (item: ParsedFoodItem): Promise<ResolvedFoodItem> => {
  try {
    const prompt = `Estimate the nutrition for: "${item.quantity} ${item.unit} ${item.original_text}"

Use typical serving sizes and known nutritional data. Be conservative.
Return ONLY valid JSON, no explanation:
{"calories": number, "protein": number, "carbs": number, "fat": number}`;

    const messages = [{ role: "user" as const, content: prompt }];
    const opts = { temperature: 0.1, maxTokens: 80 };

    const response = await getOpenAITextResponse(messages, opts);

    let content = response.content.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const match = content.match(/\{[\s\S]*\}/);
    if (match) content = match[0];
    const data = JSON.parse(content);

    return {
      name: item.normalized_query,
      original_text: item.original_text,
      quantity: item.quantity,
      unit: item.unit,
      calories: Math.round(data.calories || 0),
      protein: Math.round((data.protein || 0) * 10) / 10,
      carbs: Math.round((data.carbs || 0) * 10) / 10,
      fat: Math.round((data.fat || 0) * 10) / 10,
      confidence: "low",
      source: "gpt_estimated",
    };
  } catch {
    // Absolute last resort — return zeros
    return {
      name: item.normalized_query,
      original_text: item.original_text,
      quantity: item.quantity,
      unit: item.unit,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      confidence: "low",
      source: "gpt_estimated",
    };
  }
};

/**
 * Use GPT to estimate micronutrient content for a food item.
 * Called as an enrichment step when the primary APIs don't return micronutrient data.
 */
const enrichMicronutrientsWithGPT = async (
  name: string,
  quantity: number,
  unit: string,
  originalDescription?: string
): Promise<Partial<Record<string, number>>> => {
  try {
    const foodContext =
      originalDescription && originalDescription.toLowerCase() !== name.toLowerCase()
        ? `"${quantity} ${unit} ${name}" (described as: "${originalDescription}")`
        : `"${quantity} ${unit} ${name}"`;

    const prompt = `Estimate micronutrient content for ${foodContext}.

Return ONLY a valid JSON object — no text, no explanation, no markdown.
Use EXACTLY these key names (camelCase):
vitaminA, vitaminB1, vitaminB2, vitaminB3, vitaminB5, vitaminB6, vitaminB7, vitaminB12, vitaminC, vitaminD, vitaminE, vitaminK, folate, calcium, iron, magnesium, zinc, potassium, phosphorus, selenium, iodine, sodium, copper, manganese

Units: vitaminA/D/K/B7/B12/folate/selenium/iodine in mcg; all others in mg.
Only include keys with a non-zero value. Return {} for negligible micronutrients.

Example: {"vitaminC": 60, "calcium": 200, "iron": 8}`;

    const messages = [
      {
        role: "system" as const,
        content: "You are a nutrition database API. Always respond with only a valid JSON object. Never add any text before or after the JSON.",
      },
      { role: "user" as const, content: prompt },
    ];
    const opts = { temperature: 0.1, maxTokens: 300 };

    const response = await getOpenAITextResponse(messages, opts);

    let content = response.content.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    // Robustly extract a JSON object even if GPT adds surrounding text
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const data = JSON.parse(jsonMatch[0]);
    // Filter out zero/falsy values
    const result: Partial<Record<string, number>> = {};
    for (const [key, val] of Object.entries(data)) {
      if (typeof val === "number" && val > 0) result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves nutrition for a single parsed food item using the full fallback chain:
 *   Cache → Primary API → Secondary API → GPT refined query → GPT estimation
 */
export const resolveNutrition = async (item: ParsedFoodItem): Promise<ResolvedFoodItem> => {
  // 1. Cache check
  const cached = getFromCache(item.normalized_query, item.quantity);
  if (cached) return cached;

  let result: ResolvedFoodItem | null = null;

  // 2. Route by classification
  if (item.is_branded) {
    // Branded: FatSecret first, Edamam as fallback
    result = await tryFatSecret(item);
    if (!result) result = await tryEdamam(item);
  } else {
    // Generic: Edamam first, FatSecret as fallback
    result = await tryEdamam(item);
    if (!result) result = await tryFatSecret(item);
  }

  // 3. GPT query refinement + retry
  if (!result) {
    result = await tryWithRefinedQuery(item);
  }

  // 4. Final fallback: GPT estimation (low confidence)
  if (!result) {
    result = await estimateWithGPT(item);
  }

  // Cache the result for future requests
  setInCache(item.normalized_query, item.quantity, result);
  return result;
};

/**
 * Full pipeline: raw text → parsed items → backend lookup → API routing → result.
 *
 * Resolution order per item:
 *   1. Backend DB  (user preference > global alias > persisted cache)
 *   2. In-memory cache
 *   3. Live API routing (FatSecret / Edamam / GPT fallback chain)
 *   4. Async-store new resolutions back to backend
 *
 * @param input  Free-form food description (e.g. "had a banana and red bull")
 */
export const analyzeNutritionAdvanced = async (
  input: string,
  precomputedItems?: ParsedFoodItem[]
): Promise<NutritionAnalysisResult> => {
  // Step 1: Parse food items — skip if already provided by caller
  const parsedItems = precomputedItems && precomputedItems.length > 0
    ? precomputedItems
    : await parseFoodInput(input);

  // Step 2: Batch-check backend DB for all items in one round-trip
  const userId = await getDeviceId();
  const backendHits = await batchLookup(
    userId,
    parsedItems.map((item) => ({ query: item.normalized_query, quantity: item.quantity }))
  );

  // Step 3: Resolve each item in parallel — DB hit or full API chain
  const resolutionResults = await Promise.all(
    parsedItems.map(async (parsed) => {
      const key = `${parsed.normalized_query.toLowerCase().trim().replace(/\s+/g, " ")}:${Math.round(parsed.quantity * 10) / 10}`;
      const dbHit = backendHits[key];

      if (dbHit) {
        return {
          resolved: {
            name: dbHit.name,
            original_text: parsed.original_text,
            quantity: parsed.quantity,
            unit: parsed.unit,
            calories: dbHit.calories,
            protein: dbHit.protein,
            carbs: dbHit.carbs,
            fat: dbHit.fat,
            confidence: dbHit.confidence,
            source: dbHit.source,
          } as ResolvedFoodItem,
          storePayload: null,
        };
      }

      const memCached = getFromCache(parsed.normalized_query, parsed.quantity);
      if (memCached) {
        return { resolved: memCached, storePayload: null };
      }

      const resolved = await resolveNutrition(parsed);
      return {
        resolved,
        storePayload: toStorePayload(resolved, parsed.normalized_query, parsed.parse_confidence),
      };
    })
  );

  const resolvedItems: ResolvedFoodItem[] = resolutionResults.map((r) => r.resolved);
  const toStore: ReturnType<typeof toStorePayload>[] = resolutionResults
    .filter((r) => r.storePayload !== null)
    .map((r) => r.storePayload!);

  // Step 4: Persist new resolutions to backend (fire-and-forget, non-blocking)
  if (toStore.length > 0) {
    storeResolved(userId, toStore).catch(() => {});
  }

  // Step 4b: Enrich micronutrients in the background — don't block navigation
  Promise.all(
    resolvedItems.map(async (item, i) => {
      if (!item.micronutrients || Object.keys(item.micronutrients).length === 0) {
        const micros = await enrichMicronutrientsWithGPT(
          item.name,
          item.quantity,
          item.unit,
          item.original_text
        );
        if (Object.keys(micros).length > 0) {
          resolvedItems[i] = { ...item, micronutrients: micros as any };
          setInCache(item.name, item.quantity, resolvedItems[i]);
        }
      }
    })
  ).catch(() => {});

  // Step 5: Aggregate totals
  const total = resolvedItems.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: Math.round((acc.protein + item.protein) * 10) / 10,
      carbs: Math.round((acc.carbs + item.carbs) * 10) / 10,
      fat: Math.round((acc.fat + item.fat) * 10) / 10,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const has_low_confidence = resolvedItems.some((item) => item.confidence === "low");

  return { items: resolvedItems, total, has_low_confidence };
};

/**
 * Convert an analyzeNutritionAdvanced result into ParsedMealData for MealConfirmationModal.
 * Preserves per-item confidence and source metadata.
 */
export const toMealConfirmationData = (
  result: NutritionAnalysisResult,
  description: string
) => {
  // Aggregate micronutrients across all resolved items
  const micronutrients: Record<string, number> = {};
  for (const item of result.items) {
    if (item.micronutrients) {
      for (const [key, val] of Object.entries(item.micronutrients)) {
        if (val !== undefined) {
          micronutrients[key] = (micronutrients[key] ?? 0) + val;
        }
      }
    }
  }

  return {
    description,
    ingredients: result.items.map((item) => {
      const prefix =
        item.unit !== "serving" ? `${item.quantity} ${item.unit} ` : `${item.quantity} `;
      return `${prefix}${item.name}`;
    }),
    ingredientNutrition: result.items.map((item) => ({
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      confidence: item.confidence,
      source: item.source,
      micronutrients: item.micronutrients,
    })),
    calories: result.total.calories,
    protein: result.total.protein,
    carbs: result.total.carbs,
    fat: result.total.fat,
    micronutrients: Object.keys(micronutrients).length > 0 ? micronutrients : undefined,
  };
};

/**
 * Retroactively enrich stored meals that have no micronutrient data.
 * Returns a map of meal id → micronutrients to update.
 * Limits to meals from the last 30 days to avoid excessive API calls.
 */
export const enrichMicronutrientsForMeals = async (
  meals: Meal[]
): Promise<Array<{ id: string; micronutrients: Partial<Record<string, number>> }>> => {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const toEnrich = meals.filter(
    (m) => (!m.micronutrients || Object.keys(m.micronutrients).length === 0) &&
    m.timestamp >= thirtyDaysAgo
  );
  if (toEnrich.length === 0) return [];

  const results = await Promise.all(
    toEnrich.map(async (meal) => {
      const micros = await enrichMicronutrientsWithGPT(meal.description, 1, "serving");
      return { id: meal.id, micronutrients: micros };
    })
  );
  return results.filter((r) => Object.keys(r.micronutrients).length > 0);
};
