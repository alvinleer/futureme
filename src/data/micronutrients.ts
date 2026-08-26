export type MicronutrientKey =
  | "vitaminA" | "vitaminB1" | "vitaminB2" | "vitaminB3" | "vitaminB5"
  | "vitaminB6" | "vitaminB7" | "vitaminB12" | "vitaminC" | "vitaminD"
  | "vitaminE" | "vitaminK" | "folate"
  | "calcium" | "iron" | "magnesium" | "zinc" | "potassium"
  | "phosphorus" | "selenium" | "iodine" | "sodium" | "copper" | "manganese";

export interface MicronutrientInfo {
  key: MicronutrientKey;
  name: string;
  /** Short label used in UI chips */
  abbr: string;
  unit: string;
  category: "vitamin" | "mineral";
  /** Reference daily intake (general adult) */
  rdi: number;
  /** Recommended amount adjusted for each goal type */
  rdiByGoal: Record<"lose" | "gain" | "other", number>;
  /** Goals this nutrient is pre-selected for */
  suggestedFor: ("lose" | "gain" | "other")[];
  /** Short reason why it matters for the suggested goals */
  reason: string;
}

export const MICRONUTRIENTS: MicronutrientInfo[] = [
  // ── Vitamins ────────────────────────────────────────────────────────────────
  {
    key: "vitaminA",
    name: "Vitamin A",
    abbr: "Vit A",
    unit: "mcg",
    category: "vitamin",
    rdi: 900,
    rdiByGoal: { lose: 900, gain: 900, other: 900 },
    suggestedFor: ["other"],
    reason: "Immune function and cell growth",
  },
  {
    key: "vitaminB1",
    name: "Vitamin B1",
    abbr: "B1",
    unit: "mg",
    category: "vitamin",
    rdi: 1.2,
    rdiByGoal: { lose: 1.2, gain: 1.5, other: 1.2 },
    suggestedFor: ["gain"],
    reason: "Carbohydrate metabolism for energy production",
  },
  {
    key: "vitaminB2",
    name: "Vitamin B2",
    abbr: "B2",
    unit: "mg",
    category: "vitamin",
    rdi: 1.3,
    rdiByGoal: { lose: 1.3, gain: 1.6, other: 1.3 },
    suggestedFor: [],
    reason: "Energy metabolism and red blood cell production",
  },
  {
    key: "vitaminB3",
    name: "Niacin (B3)",
    abbr: "B3",
    unit: "mg",
    category: "vitamin",
    rdi: 16,
    rdiByGoal: { lose: 16, gain: 18, other: 16 },
    suggestedFor: ["gain"],
    reason: "Supports muscle repair and energy metabolism",
  },
  {
    key: "vitaminB6",
    name: "Vitamin B6",
    abbr: "B6",
    unit: "mg",
    category: "vitamin",
    rdi: 1.7,
    rdiByGoal: { lose: 1.7, gain: 2.0, other: 1.7 },
    suggestedFor: ["gain"],
    reason: "Essential for protein metabolism and muscle synthesis",
  },
  {
    key: "vitaminB5",
    name: "Pantothenic Acid (B5)",
    abbr: "B5",
    unit: "mg",
    category: "vitamin",
    rdi: 5,
    rdiByGoal: { lose: 5, gain: 6, other: 5 },
    suggestedFor: [],
    reason: "Converts food to energy and supports hormone production",
  },
  {
    key: "vitaminB7",
    name: "Biotin (B7)",
    abbr: "B7",
    unit: "mcg",
    category: "vitamin",
    rdi: 30,
    rdiByGoal: { lose: 30, gain: 35, other: 30 },
    suggestedFor: [],
    reason: "Fat and carbohydrate metabolism, hair and nail health",
  },
  {
    key: "vitaminB12",
    name: "Vitamin B12",
    abbr: "B12",
    unit: "mcg",
    category: "vitamin",
    rdi: 2.4,
    rdiByGoal: { lose: 2.4, gain: 2.4, other: 2.4 },
    suggestedFor: ["lose", "other"],
    reason: "Energy production and nerve function",
  },
  {
    key: "vitaminC",
    name: "Vitamin C",
    abbr: "Vit C",
    unit: "mg",
    category: "vitamin",
    rdi: 90,
    rdiByGoal: { lose: 90, gain: 90, other: 90 },
    suggestedFor: ["other"],
    reason: "Antioxidant protection and immune support",
  },
  {
    key: "vitaminD",
    name: "Vitamin D",
    abbr: "Vit D",
    unit: "IU",
    category: "vitamin",
    rdi: 600,
    rdiByGoal: { lose: 600, gain: 800, other: 600 },
    suggestedFor: ["lose", "gain", "other"],
    reason: "Muscle function, testosterone support, and bone health",
  },
  {
    key: "vitaminE",
    name: "Vitamin E",
    abbr: "Vit E",
    unit: "mg",
    category: "vitamin",
    rdi: 15,
    rdiByGoal: { lose: 15, gain: 15, other: 15 },
    suggestedFor: ["other"],
    reason: "Antioxidant that supports muscle recovery",
  },
  {
    key: "vitaminK",
    name: "Vitamin K",
    abbr: "Vit K",
    unit: "mcg",
    category: "vitamin",
    rdi: 120,
    rdiByGoal: { lose: 120, gain: 120, other: 120 },
    suggestedFor: ["other"],
    reason: "Blood clotting, bone metabolism, and calcium regulation",
  },
  {
    key: "folate",
    name: "Folate (B9)",
    abbr: "B9",
    unit: "mcg",
    category: "vitamin",
    rdi: 400,
    rdiByGoal: { lose: 400, gain: 400, other: 400 },
    suggestedFor: [],
    reason: "Cell production and DNA synthesis",
  },

  // ── Minerals ─────────────────────────────────────────────────────────────────
  {
    key: "calcium",
    name: "Calcium",
    abbr: "Ca",
    unit: "mg",
    category: "mineral",
    rdi: 1000,
    rdiByGoal: { lose: 1200, gain: 1000, other: 1000 },
    suggestedFor: ["lose", "gain"],
    reason: "Bone density protection and muscle contraction",
  },
  {
    key: "iron",
    name: "Iron",
    abbr: "Iron",
    unit: "mg",
    category: "mineral",
    rdi: 8,
    rdiByGoal: { lose: 18, gain: 18, other: 8 },
    suggestedFor: ["lose", "gain"],
    reason: "Oxygen transport — often depleted in deficits and high training",
  },
  {
    key: "magnesium",
    name: "Magnesium",
    abbr: "Mg",
    unit: "mg",
    category: "mineral",
    rdi: 420,
    rdiByGoal: { lose: 420, gain: 450, other: 420 },
    suggestedFor: ["lose", "gain", "other"],
    reason: "Muscle recovery, sleep quality, and energy production",
  },
  {
    key: "zinc",
    name: "Zinc",
    abbr: "Zn",
    unit: "mg",
    category: "mineral",
    rdi: 11,
    rdiByGoal: { lose: 11, gain: 14, other: 11 },
    suggestedFor: ["lose", "gain", "other"],
    reason: "Testosterone regulation, immune function, and protein synthesis",
  },
  {
    key: "potassium",
    name: "Potassium",
    abbr: "K",
    unit: "mg",
    category: "mineral",
    rdi: 3500,
    rdiByGoal: { lose: 3500, gain: 3500, other: 3500 },
    suggestedFor: ["lose", "other"],
    reason: "Electrolyte balance and heart health",
  },
  {
    key: "phosphorus",
    name: "Phosphorus",
    abbr: "Phos",
    unit: "mg",
    category: "mineral",
    rdi: 700,
    rdiByGoal: { lose: 700, gain: 800, other: 700 },
    suggestedFor: ["gain"],
    reason: "ATP energy production and muscle contraction",
  },
  {
    key: "selenium",
    name: "Selenium",
    abbr: "Se",
    unit: "mcg",
    category: "mineral",
    rdi: 55,
    rdiByGoal: { lose: 55, gain: 55, other: 55 },
    suggestedFor: ["other"],
    reason: "Antioxidant enzyme support and thyroid function",
  },
  {
    key: "iodine",
    name: "Iodine",
    abbr: "Iodine",
    unit: "mcg",
    category: "mineral",
    rdi: 150,
    rdiByGoal: { lose: 150, gain: 150, other: 150 },
    suggestedFor: [],
    reason: "Thyroid hormone production and metabolism",
  },
  {
    key: "sodium",
    name: "Sodium",
    abbr: "Na",
    unit: "mg",
    category: "mineral",
    rdi: 2300,
    rdiByGoal: { lose: 2000, gain: 2300, other: 2300 },
    suggestedFor: ["gain"],
    reason: "Electrolyte balance, nerve signaling, and muscle function",
  },
  {
    key: "copper",
    name: "Copper",
    abbr: "Cu",
    unit: "mcg",
    category: "mineral",
    rdi: 900,
    rdiByGoal: { lose: 900, gain: 1000, other: 900 },
    suggestedFor: [],
    reason: "Iron metabolism, collagen formation, and antioxidant defense",
  },
  {
    key: "manganese",
    name: "Manganese",
    abbr: "Mn",
    unit: "mg",
    category: "mineral",
    rdi: 2.3,
    rdiByGoal: { lose: 2.3, gain: 2.6, other: 2.3 },
    suggestedFor: [],
    reason: "Bone formation, antioxidant enzyme support, and energy metabolism",
  },
];

/** Default selections for a given goal type */
export function getDefaultMicronutrients(goalType: "lose" | "gain" | "other"): MicronutrientKey[] {
  return MICRONUTRIENTS
    .filter((m) => m.suggestedFor.includes(goalType))
    .map((m) => m.key);
}

/** Look up a micronutrient by key */
export function getMicronutrient(key: MicronutrientKey): MicronutrientInfo | undefined {
  return MICRONUTRIENTS.find((m) => m.key === key);
}
