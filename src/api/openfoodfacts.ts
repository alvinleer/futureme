/**
 * OpenFoodFacts API — free barcode lookup (no auth required).
 * Used as a fallback when FatSecret doesn't have a product.
 *
 * Docs: https://world.openfoodfacts.org/data
 */

export interface OpenFoodFactsResult {
  food_name: string;
  brand_name?: string;
  /** Macros are normalised to this many grams (100 when only per-100g data is available, otherwise the serving size in grams). */
  base_amount_g: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size?: string;
}

interface OFFProduct {
  product_name?: string;
  brands?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    "energy-kcal_serving"?: number;
    proteins_100g?: number;
    proteins_serving?: number;
    carbohydrates_100g?: number;
    carbohydrates_serving?: number;
    fat_100g?: number;
    fat_serving?: number;
  };
  serving_size?: string;
  serving_quantity?: number;
}

interface OFFResponse {
  status: number;
  product?: OFFProduct;
}

/**
 * Look up a product by barcode using the OpenFoodFacts API.
 * Returns null if not found or on network error.
 */
export const lookupBarcode = async (
  barcode: string
): Promise<OpenFoodFactsResult | null> => {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,nutriments,serving_size,serving_quantity`,
      { headers: { "User-Agent": "FutureMe-App/1.0" } }
    );

    if (!res.ok) return null;

    const data = await res.json() as OFFResponse;
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const n = p.nutriments ?? {};

    // Prefer per-serving values; fall back to per-100g
    const hasServing = n["energy-kcal_serving"] != null;
    const calories = hasServing
      ? (n["energy-kcal_serving"] ?? 0)
      : (n["energy-kcal_100g"] ?? 0);
    const protein = hasServing
      ? (n.proteins_serving ?? 0)
      : (n.proteins_100g ?? 0);
    const carbs = hasServing
      ? (n.carbohydrates_serving ?? 0)
      : (n.carbohydrates_100g ?? 0);
    const fat = hasServing
      ? (n.fat_serving ?? 0)
      : (n.fat_100g ?? 0);

    const name = p.product_name?.trim() || "Unknown Product";
    const brand = p.brands?.split(",")[0]?.trim();

    // Determine how many grams the macro values correspond to.
    // When using per-serving values, use serving_quantity (grams) if available.
    // When falling back to per-100g, the base is always 100g.
    let base_amount_g: number;
    if (hasServing) {
      base_amount_g = p.serving_quantity || 100;
    } else {
      base_amount_g = 100;
    }

    return {
      food_name: name,
      brand_name: brand,
      base_amount_g,
      calories: Math.round(calories),
      protein: Math.round(protein * 10) / 10,
      carbs: Math.round(carbs * 10) / 10,
      fat: Math.round(fat * 10) / 10,
      serving_size: p.serving_size,
    };
  } catch {
    return null;
  }
};
