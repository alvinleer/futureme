/*
IMPORTANT NOTICE: DO NOT REMOVE
./src/api/edamam-nutrition.ts
This file provides integration with the Edamam Nutrition Analysis API for looking up
detailed nutrition data including calories, macronutrients, and micronutrients.
*/

import { getOpenAIChatResponse } from "./chat-service";
import { MicronutrientKey } from "../data/micronutrients";
import { useAuthStore } from "../state/authStore";

const BACKEND_URL = (process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

const authHeaders = (): Record<string, string> => {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface EdamamNutrient {
  label: string;
  quantity: number;
  unit: string;
}

export interface EdamamNutritionResponse {
  uri?: string;
  calories: number;
  totalWeight: number;
  dietLabels: string[];
  healthLabels: string[];
  cautions: string[];
  totalNutrients: {
    ENERC_KCAL?: EdamamNutrient; // Energy (kcal)
    FAT?: EdamamNutrient; // Total Fat (g)
    FASAT?: EdamamNutrient; // Saturated Fat (g)
    FATRN?: EdamamNutrient; // Trans Fat (g)
    FAMS?: EdamamNutrient; // Monounsaturated Fat (g)
    FAPU?: EdamamNutrient; // Polyunsaturated Fat (g)
    CHOCDF?: EdamamNutrient; // Carbohydrates (g)
    "CHOCDF.net"?: EdamamNutrient; // Net Carbs (g)
    FIBTG?: EdamamNutrient; // Fiber (g)
    SUGAR?: EdamamNutrient; // Sugars (g)
    "SUGAR.added"?: EdamamNutrient; // Added Sugars (g)
    PROCNT?: EdamamNutrient; // Protein (g)
    CHOLE?: EdamamNutrient; // Cholesterol (mg)
    NA?: EdamamNutrient; // Sodium (mg)
    CA?: EdamamNutrient; // Calcium (mg)
    MG?: EdamamNutrient; // Magnesium (mg)
    K?: EdamamNutrient; // Potassium (mg)
    FE?: EdamamNutrient; // Iron (mg)
    ZN?: EdamamNutrient; // Zinc (mg)
    P?: EdamamNutrient; // Phosphorus (mg)
    VITA_RAE?: EdamamNutrient; // Vitamin A (mcg)
    VITC?: EdamamNutrient; // Vitamin C (mg)
    THIA?: EdamamNutrient; // Thiamin B1 (mg)
    RIBF?: EdamamNutrient; // Riboflavin B2 (mg)
    NIA?: EdamamNutrient; // Niacin B3 (mg)
    VITB6A?: EdamamNutrient; // Vitamin B6 (mg)
    FOLDFE?: EdamamNutrient; // Folate (mcg)
    FOLFD?: EdamamNutrient; // Folate food (mcg)
    FOLAC?: EdamamNutrient; // Folic acid (mcg)
    VITB12?: EdamamNutrient; // Vitamin B12 (mcg)
    VITD?: EdamamNutrient; // Vitamin D (mcg)
    TOCPHA?: EdamamNutrient; // Vitamin E (mg)
    VITK1?: EdamamNutrient; // Vitamin K (mcg)
    WATER?: EdamamNutrient; // Water (g)
  };
  totalDaily: {
    [key: string]: EdamamNutrient;
  };
  ingredients?: Array<{
    text: string;
    parsed?: Array<{
      quantity: number;
      measure: string;
      foodMatch: string;
      food: string;
      foodId: string;
      weight: number;
      retainedWeight: number;
      nutrients: {
        [key: string]: EdamamNutrient;
      };
      measureURI: string;
      status: string;
    }>;
  }>;
}

export interface SimplifiedNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  cholesterol?: number;
  saturatedFat?: number;
  dietLabels: string[];
  healthLabels: string[];
  micronutrients?: Partial<Record<MicronutrientKey, number>>;
}

export interface EdamamError {
  error: string;
  message: string;
}

/**
 * Parse a single ingredient using Edamam Food Database API
 * @param ingredient - Ingredient string (e.g., "1 cup rice")
 * @returns Parsed food data with nutrition info
 */
const parseIngredient = async (ingredient: string): Promise<{
  foodId: string;
  measureURI: string;
  quantity: number;
} | null> => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/edamam/parse?ingredient=${encodeURIComponent(ingredient)}`, {
      headers: authHeaders(),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Authentication failed: ${errorText}`);
    }

    const data = await response.json();

    // Get the parsed result or first hint
    if (data.parsed && data.parsed.length > 0) {
      const parsed = data.parsed[0];
      return {
        foodId: parsed.food.foodId,
        measureURI: parsed.measure?.uri || "http://www.edamam.com/ontologies/edamam.owl#Measure_gram",
        quantity: parsed.quantity || 1,
      };
    } else if (data.hints && data.hints.length > 0) {
      const hint = data.hints[0];
      // If the query starts with "{number}g " extract the gram amount and use the gram measure
      const gramsMatch = ingredient.match(/^(\d+(?:\.\d+)?)g\s/i);
      const gramURI = "http://www.edamam.com/ontologies/edamam.owl#Measure_gram";
      if (gramsMatch) {
        return {
          foodId: hint.food.foodId,
          measureURI: gramURI,
          quantity: parseFloat(gramsMatch[1]),
        };
      }
      // Extract leading number from query so we don't always default to 1
      const numMatch = ingredient.match(/^(\d+(?:\.\d+)?)\s/);
      const parsedQty = numMatch ? parseFloat(numMatch[1]) : 1;
      const measure = hint.measures?.[0];
      return {
        foodId: hint.food.foodId,
        measureURI: measure?.uri || gramURI,
        quantity: parsedQty,
      };
    }
    return null;
  } catch (error) {
    console.error("Error parsing ingredient:", ingredient, error);
    throw error;
  }
};

// Max ingredients per API request (Edamam Food Database API has a strict limit)
// The Nutrients API typically allows fewer ingredients than documented
// Reduced to 3 to avoid "Too many ingredients" errors
const MAX_INGREDIENTS_PER_BATCH = 3;

/**
 * Get nutrients for a batch of parsed ingredients using Edamam Food Database API
 * @param parsedIngredients - Array of parsed ingredient objects (max 5)
 * @returns Nutrition data
 */
const getNutrientsBatch = async (parsedIngredients: Array<{
  foodId: string;
  measureURI: string;
  quantity: number;
}>): Promise<EdamamNutritionResponse> => {
  const body = {
    ingredients: parsedIngredients.map((ing) => ({
      quantity: ing.quantity,
      measureURI: ing.measureURI,
      foodId: ing.foodId,
    })),
  };

  const response = await fetch(`${BACKEND_URL}/api/edamam/nutrients`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Nutrients API error: ${errorText}`);
  }

  return response.json();
};

/**
 * Get nutrients for parsed ingredients, batching if needed
 * @param parsedIngredients - Array of parsed ingredient objects
 * @returns Combined nutrition data
 */
const getNutrients = async (parsedIngredients: Array<{
  foodId: string;
  measureURI: string;
  quantity: number;
}>): Promise<EdamamNutritionResponse> => {
  // If within limit, make single request
  if (parsedIngredients.length <= MAX_INGREDIENTS_PER_BATCH) {
    return getNutrientsBatch(parsedIngredients);
  }

  // Batch ingredients and combine results
  const batches: Array<Array<{ foodId: string; measureURI: string; quantity: number }>> = [];
  for (let i = 0; i < parsedIngredients.length; i += MAX_INGREDIENTS_PER_BATCH) {
    batches.push(parsedIngredients.slice(i, i + MAX_INGREDIENTS_PER_BATCH));
  }

  const results = await Promise.all(batches.map((batch) => getNutrientsBatch(batch)));

  // Combine all batch results
  const combined: EdamamNutritionResponse = {
    calories: 0,
    totalWeight: 0,
    dietLabels: [],
    healthLabels: [],
    cautions: [],
    totalNutrients: {},
    totalDaily: {},
  };

  for (const result of results) {
    combined.calories += result.calories || 0;
    combined.totalWeight += result.totalWeight || 0;

    // Combine nutrients
    if (result.totalNutrients) {
      for (const [key, nutrient] of Object.entries(result.totalNutrients)) {
        const existing = combined.totalNutrients[key as keyof typeof combined.totalNutrients];
        if (existing && nutrient) {
          existing.quantity += nutrient.quantity;
        } else if (nutrient) {
          (combined.totalNutrients as Record<string, EdamamNutrient>)[key] = { ...nutrient };
        }
      }
    }
  }

  return combined;
};

/**
 * Analyze nutrition data for a food item or recipe using the Edamam Food Database API
 * @param ingredients - Array of ingredient strings (e.g., ["1 cup rice", "2 eggs"])
 * @param title - Optional title for the recipe/meal
 * @returns Full Edamam nutrition response
 */
export const analyzeNutrition = async (
  ingredients: string[],
  title?: string
): Promise<EdamamNutritionResponse> => {
  try {
    // Parse each ingredient to get food IDs
    const parsedIngredients: Array<{
      foodId: string;
      measureURI: string;
      quantity: number;
    }> = [];

    for (const ingredient of ingredients) {
      const parsed = await parseIngredient(ingredient);
      if (parsed) {
        parsedIngredients.push(parsed);
      }
    }

    if (parsedIngredients.length === 0) {
      throw new Error("Could not parse any ingredients");
    }

    // Get combined nutrition data
    const nutritionData = await getNutrients(parsedIngredients);
    return nutritionData;
  } catch (error) {
    throw error;
  }
};

/**
 * Estimate nutrition using AI when Edamam API fails
 * @param ingredients - Array of ingredient strings
 * @param title - Optional meal title
 * @returns Estimated nutrition data
 */
const estimateNutritionWithAI = async (
  ingredients: string[],
  title?: string
): Promise<SimplifiedNutrition> => {
  const ingredientList = ingredients.join(", ");
  const mealDescription = title ? `${title}: ${ingredientList}` : ingredientList;

  const prompt = `Estimate the total nutrition for this meal: ${mealDescription}

Respond with ONLY a valid JSON object in this exact format (no markdown, no explanation):
{
  "calories": <number>,
  "protein": <number in grams>,
  "carbs": <number in grams>,
  "fat": <number in grams>
}

Be as accurate as possible based on typical serving sizes and nutritional data.`;

  try {
    const res = await getOpenAIChatResponse(prompt);
    let content = res.content.trim();

    // Clean up response if it has markdown code blocks
    if (content.startsWith("```json")) {
      content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (content.startsWith("```")) {
      content = content.replace(/```\n?/g, "");
    }
    // Extract JSON object robustly
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) content = jsonMatch[0];

    const data = JSON.parse(content.trim());

    return {
      calories: Math.round(data.calories || 0),
      protein: Math.round(data.protein || 0),
      carbs: Math.round(data.carbs || 0),
      fat: Math.round(data.fat || 0),
      dietLabels: [],
      healthLabels: [],
    };
  } catch (aiError) {
    console.error("AI nutrition estimation failed:", aiError);
    // Return zeros as last resort
    return {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      dietLabels: [],
      healthLabels: [],
    };
  }
};

/**
 * Get simplified nutrition data for a food item or recipe
 * @param ingredients - Array of ingredient strings (e.g., ["1 cup rice", "2 eggs"])
 * @param title - Optional title for the recipe/meal
 * @returns Simplified nutrition object with key macros and micros
 */
export const getSimplifiedNutrition = async (
  ingredients: string[],
  title?: string
): Promise<SimplifiedNutrition> => {
  try {
    const data = await analyzeNutrition(ingredients, title);
    const n = data.totalNutrients;

    // Map Edamam nutrient codes to our MicronutrientKey system
    // Vitamin D: Edamam returns mcg, our system uses IU (1 mcg = 40 IU)
    const micronutrients: Partial<Record<MicronutrientKey, number>> = {};
    if (n?.VITA_RAE?.quantity) micronutrients.vitaminA = Math.round(n.VITA_RAE.quantity * 10) / 10;
    if (n?.THIA?.quantity) micronutrients.vitaminB1 = Math.round(n.THIA.quantity * 100) / 100;
    if (n?.RIBF?.quantity) micronutrients.vitaminB2 = Math.round(n.RIBF.quantity * 100) / 100;
    if (n?.NIA?.quantity) micronutrients.vitaminB3 = Math.round(n.NIA.quantity * 10) / 10;
    if (n?.VITB6A?.quantity) micronutrients.vitaminB6 = Math.round(n.VITB6A.quantity * 100) / 100;
    if (n?.VITB12?.quantity) micronutrients.vitaminB12 = Math.round(n.VITB12.quantity * 100) / 100;
    if (n?.VITC?.quantity) micronutrients.vitaminC = Math.round(n.VITC.quantity * 10) / 10;
    if (n?.VITD?.quantity) micronutrients.vitaminD = Math.round(n.VITD.quantity * 40); // mcg → IU
    if (n?.TOCPHA?.quantity) micronutrients.vitaminE = Math.round(n.TOCPHA.quantity * 10) / 10;
    if (n?.VITK1?.quantity) micronutrients.vitaminK = Math.round(n.VITK1.quantity * 10) / 10;
    if (n?.FOLDFE?.quantity) micronutrients.folate = Math.round(n.FOLDFE.quantity * 10) / 10;
    if (n?.CA?.quantity) micronutrients.calcium = Math.round(n.CA.quantity);
    if (n?.FE?.quantity) micronutrients.iron = Math.round(n.FE.quantity * 10) / 10;
    if (n?.MG?.quantity) micronutrients.magnesium = Math.round(n.MG.quantity);
    if (n?.ZN?.quantity) micronutrients.zinc = Math.round(n.ZN.quantity * 10) / 10;
    if (n?.K?.quantity) micronutrients.potassium = Math.round(n.K.quantity);
    if (n?.P?.quantity) micronutrients.phosphorus = Math.round(n.P.quantity);
    if (n?.NA?.quantity) micronutrients.sodium = Math.round(n.NA.quantity);

    return {
      calories: Math.round(data.calories || 0),
      protein: Math.round(n?.PROCNT?.quantity || 0),
      carbs: Math.round(n?.CHOCDF?.quantity || 0),
      fat: Math.round(n?.FAT?.quantity || 0),
      fiber: n?.FIBTG?.quantity ? Math.round(n.FIBTG.quantity) : undefined,
      sugar: n?.SUGAR?.quantity ? Math.round(n.SUGAR.quantity) : undefined,
      sodium: n?.NA?.quantity ? Math.round(n.NA.quantity) : undefined,
      cholesterol: n?.CHOLE?.quantity ? Math.round(n.CHOLE.quantity) : undefined,
      saturatedFat: n?.FASAT?.quantity ? Math.round(n.FASAT.quantity) : undefined,
      dietLabels: data.dietLabels || [],
      healthLabels: data.healthLabels || [],
      micronutrients: Object.keys(micronutrients).length > 0 ? micronutrients : undefined,
    };
  } catch (error) {
    console.log("Edamam API failed, falling back to AI estimation:", error);
    return estimateNutritionWithAI(ingredients, title);
  }
};

/**
 * Analyze a single food item (convenience function)
 * @param foodDescription - Description of the food (e.g., "1 large apple", "100g chicken breast")
 * @returns Simplified nutrition object
 */
export const analyzeFoodItem = async (
  foodDescription: string
): Promise<SimplifiedNutrition> => {
  return getSimplifiedNutrition([foodDescription]);
};

/**
 * Analyze multiple food items and get combined nutrition
 * @param foodDescriptions - Array of food descriptions
 * @returns Simplified nutrition object for all items combined
 */
export const analyzeMultipleFoodItems = async (
  foodDescriptions: string[]
): Promise<SimplifiedNutrition> => {
  return getSimplifiedNutrition(foodDescriptions);
};
