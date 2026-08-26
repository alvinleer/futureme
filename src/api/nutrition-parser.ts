/**
 * GPT-based food parsing layer.
 *
 * Responsibilities:
 *  - Split compound meal descriptions into individual food items
 *  - Normalize names for API search queries
 *  - Estimate quantities and units from natural language
 *  - Classify branded vs. generic foods
 *
 * IMPORTANT: This layer does NOT estimate nutrition values.
 * Nutrition is resolved by the routing layer (Edamam / FatSecret / GPT fallback).
 */

import { getOpenAITextResponse } from "./chat-service";
import { ParsedFoodItem } from "./nutrition-types";

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — instructs the model on parsing rules, schema, and constraints
// ─────────────────────────────────────────────────────────────────────────────

const PARSE_SYSTEM_PROMPT = `You are a nutrition parsing engine. Your job is to convert messy, conversational food input into structured food items.

OBJECTIVE
Extract individual food items from user input and return a clean JSON array with:
- normalized food names
- quantities
- units
- estimated grams (if possible)
- branded vs generic classification

You DO NOT calculate calories or macros.

OUTPUT (STRICT JSON ONLY)
Return ONLY a JSON array. No explanation, no markdown, no code fences.

Each item must follow this schema:
{
  "original_text": string,
  "normalized_query": string,
  "quantity": number,
  "unit": string,
  "estimated_grams": number | null,
  "is_branded": boolean,
  "confidence": number (0–1)
}

CRITICAL RULE — NON-FOOD INPUT
If the input does NOT describe any food or drink, return an empty array: []
This includes:
- URLs or website addresses (e.g. "www.example.com", "visit fema.gov")
- System messages, notifications, or alerts (e.g. "Emergency Alert", "For more information visit...")
- Advertisements or promotional text
- Random words, numbers, or garbled speech with no food context
- Any text that a reasonable person would not recognize as a food description

Examples of non-food input → return []:
- "1 For more information visit www.FEMA.gov" → []
- "Emergency broadcast system" → []
- "https://example.com/page" → []
- "Testing testing 1 2 3" → []

RULES

1. Split items
   - Break input into separate food/drink items
   - Each ingredient or product = one object

2. Normalize food names
   - Use simple, searchable names
   - "a big bowl of spaghetti bolognese" → "spaghetti bolognese"
   - "coke zero" → "coca cola zero"

3. Quantities
   - Extract explicit numbers when present
   - If vague, estimate reasonably:
     - "a banana" → 1
     - "some nuts" → 1
     - "a few strawberries" → 4

4. Units — use standardized units:
   "g", "ml", "serving", "slice", "piece", "cup", "tbsp", "tsp", "can", "bottle", "medium", "large", "small", "scoop"

5. Estimated grams
   - Provide grams when reasonably inferable
   - banana (medium) → 118g
   - apple (large) → 220g
   - can of soda → 330g
   - If unclear → null

6. Branded classification
   Set is_branded = true if a specific product or brand is mentioned, or it is a recognizable packaged food or drink.
   - "Red Bull" → true
   - "protein yogurt" → true
   - "banana" → false
   - "chicken breast" → false

7. Confidence score
   - 0.9–1.0 → very clear ("1 banana")
   - 0.7–0.9 → reasonable estimate
   - 0.5–0.7 → vague input
   - <0.5 → very uncertain — these are almost certainly not food items

8. Remove noise — ignore filler words and irrelevant context.

CONSTRAINTS
- DO NOT hallucinate nutrition values
- DO NOT explain anything
- DO NOT include text outside JSON
- ALWAYS return valid JSON
- ALWAYS use English food names in both original_text and normalized_query fields, even if the input appears to be in another language or script
- If input contains non-English characters, translate to the best English food name equivalent`;

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses a free-form food description into structured items using GPT.
 * Falls back to a single generic item on parse failure.
 *
 * GPT returns `confidence` (0-1 float); we store it as `parse_confidence`
 * to distinguish it from `ResolvedFoodItem.confidence` ("high"|"medium"|"low").
 */
export const parseFoodInput = async (input: string): Promise<ParsedFoodItem[]> => {
  // Quick pre-check: if the input contains a URL, it's almost certainly not food
  const containsUrl = /https?:\/\/|www\.[a-z0-9]/i.test(input);
  if (containsUrl) {
    throw new Error("No food detected. Please try again and describe what you ate.");
  }

  const userMessage = `Parse this food input into structured items:

"${input}"

Return ONLY the JSON array, no other text.`;

  try {
    const response = await getOpenAITextResponse(
      [
        { role: "system", content: PARSE_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      { model: "gpt-4o", temperature: 0, maxTokens: 1024 }
    );

    let content = response.content.trim();
    // Strip any stray markdown code fences
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    // Extract JSON array from response in case model included surrounding text
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) content = jsonMatch[0];

    const parsed = JSON.parse(content);
    const rawItems: Array<Record<string, unknown>> = Array.isArray(parsed) ? parsed : [parsed];

    // Map GPT's `confidence` field → our internal `parse_confidence` field
    // Also filter out low-confidence items (likely not food)
    const MIN_FOOD_CONFIDENCE = 0.5;
    const items: ParsedFoodItem[] = rawItems
      .filter(
        (item) =>
          item.original_text &&
          item.normalized_query &&
          typeof item.quantity === "number" &&
          item.unit &&
          (Number(item.confidence) || 0) >= MIN_FOOD_CONFIDENCE
      )
      .map((item) => ({
        original_text: String(item.original_text),
        normalized_query: String(item.normalized_query),
        quantity: Number(item.quantity) || 1,
        unit: String(item.unit),
        estimated_grams:
          item.estimated_grams != null ? Number(item.estimated_grams) : null,
        is_branded: Boolean(item.is_branded),
        parse_confidence: Number(item.confidence) || 0.7,
      }));

    if (items.length === 0) {
      throw new Error("No food detected. Please try again and describe what you ate.");
    }

    return items;
  } catch (err) {
    // Re-throw our own meaningful errors; use fallback only for unexpected parse failures
    if (err instanceof Error && err.message.startsWith("No food detected")) {
      throw err;
    }
    return fallback(input);
  }
};

/** Single-item fallback when GPT parse fails entirely. */
const fallback = (input: string): ParsedFoodItem[] => [
  {
    original_text: input,
    normalized_query: input,
    quantity: 1,
    unit: "serving",
    estimated_grams: null,
    is_branded: false,
    parse_confidence: 0.3,
  },
];
