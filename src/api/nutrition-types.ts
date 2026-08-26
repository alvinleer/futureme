/**
 * Shared types for the multi-layer nutrition analysis pipeline.
 * Architecture: GPT Parse → Route (FatSecret/Edamam) → Fallback Chain → Confidence Score
 */

import { MicronutrientKey } from "../data/micronutrients";

export type ConfidenceLevel = "high" | "medium" | "low";
export type NutritionSource = "edamam" | "fatsecret" | "gpt_estimated";

/**
 * Output of the GPT parsing layer.
 * GPT classifies and normalizes each food item — does NOT estimate nutrition.
 */
export interface ParsedFoodItem {
  original_text: string; // Exact phrase from user input
  normalized_query: string; // Cleaned search query for APIs
  quantity: number; // Numeric quantity (default 1)
  unit: string; // "serving", "cup", "oz", "g", "can", "slice", etc.
  estimated_grams: number | null; // Weight in grams if known
  is_branded: boolean; // true = packaged/branded product → route to FatSecret
  parse_confidence: number; // 0-1 confidence from GPT parsing
}

/**
 * A fully resolved food item with nutrition data and source metadata.
 * Returned after routing through Edamam / FatSecret / GPT estimation.
 */
export interface ResolvedFoodItem {
  name: string; // Display name of the food
  original_text: string; // User's original phrase
  quantity: number;
  unit: string;
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  fiber?: number; // grams
  confidence: ConfidenceLevel;
  source: NutritionSource;
  micronutrients?: Partial<Record<MicronutrientKey, number>>;
}

/**
 * Final output of analyzeNutritionAdvanced().
 */
export interface NutritionAnalysisResult {
  items: ResolvedFoodItem[];
  total: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  has_low_confidence: boolean;
}
