import { WorkoutEntry } from "../types/diet";

export interface ExerciseActivity {
  key: string;
  label: string;
  category: ExerciseCategory;
  mapToType: WorkoutEntry["type"];
  icon: string; // Ionicons name
  /** kcal per minute for an ~75 kg adult at the "medium" intensity.
   *  Low  = ×0.75 of this value
   *  High = ×1.30 of this value
   *  Source: MET values from ACSM / Compendium of Physical Activities (Ainsworth 2011)
   *  converted as: kcal/min ≈ MET × 0.0175 × bodyWeight(kg) → rounded for 75 kg
   */
  kcalPerMinMedium: number;
  defaultIntensity: WorkoutEntry["intensity"];
}

export type ExerciseCategory =
  | "cardio"
  | "strength"
  | "hiit"
  | "yoga"
  | "sports"
  | "outdoor"
  | "dance"
  | "water"
  | "combat"
  | "mixed";

export const EXERCISE_CATEGORIES: { key: ExerciseCategory; label: string; icon: string }[] = [
  { key: "cardio",   label: "Cardio",         icon: "heart-outline" },
  { key: "strength", label: "Strength",        icon: "barbell-outline" },
  { key: "hiit",     label: "HIIT",            icon: "flash-outline" },
  { key: "yoga",     label: "Yoga & Flex",     icon: "leaf-outline" },
  { key: "sports",   label: "Sports",          icon: "basketball-outline" },
  { key: "outdoor",  label: "Outdoor",         icon: "trail-sign-outline" },
  { key: "dance",    label: "Dance",           icon: "musical-notes-outline" },
  { key: "water",    label: "Water",           icon: "water-outline" },
  { key: "combat",   label: "Combat",          icon: "shield-outline" },
  { key: "mixed",    label: "Mixed / Other",   icon: "body-outline" },
];

export const EXERCISE_ACTIVITIES: ExerciseActivity[] = [
  // ─── CARDIO ───────────────────────────────────────────────────────────────
  {
    key: "walking",
    label: "Walking",
    category: "cardio",
    mapToType: "cardio",
    icon: "walk-outline",
    kcalPerMinMedium: 5,
    defaultIntensity: "low",
  },
  {
    key: "running",
    label: "Running",
    category: "cardio",
    mapToType: "cardio",
    icon: "walk-outline",
    kcalPerMinMedium: 11,
    defaultIntensity: "medium",
  },
  {
    key: "running_fast",
    label: "Running (fast)",
    category: "cardio",
    mapToType: "cardio",
    icon: "walk-outline",
    kcalPerMinMedium: 14,
    defaultIntensity: "high",
  },
  {
    key: "cycling",
    label: "Cycling",
    category: "cardio",
    mapToType: "cardio",
    icon: "bicycle-outline",
    kcalPerMinMedium: 8,
    defaultIntensity: "medium",
  },
  {
    key: "stationary_bike",
    label: "Stationary Bike",
    category: "cardio",
    mapToType: "cardio",
    icon: "bicycle-outline",
    kcalPerMinMedium: 8,
    defaultIntensity: "medium",
  },
  {
    key: "elliptical",
    label: "Elliptical",
    category: "cardio",
    mapToType: "cardio",
    icon: "sync-outline",
    kcalPerMinMedium: 8,
    defaultIntensity: "medium",
  },
  {
    key: "treadmill",
    label: "Treadmill",
    category: "cardio",
    mapToType: "cardio",
    icon: "fitness-outline",
    kcalPerMinMedium: 10,
    defaultIntensity: "medium",
  },
  {
    key: "rowing_machine",
    label: "Rowing Machine",
    category: "cardio",
    mapToType: "cardio",
    icon: "boat-outline",
    kcalPerMinMedium: 9,
    defaultIntensity: "medium",
  },
  {
    key: "jump_rope",
    label: "Jump Rope",
    category: "cardio",
    mapToType: "hiit",
    icon: "repeat-outline",
    kcalPerMinMedium: 12,
    defaultIntensity: "high",
  },
  {
    key: "stair_climbing",
    label: "Stair Climbing",
    category: "cardio",
    mapToType: "cardio",
    icon: "trending-up-outline",
    kcalPerMinMedium: 9,
    defaultIntensity: "medium",
  },
  {
    key: "stair_stepper",
    label: "Stair Stepper",
    category: "cardio",
    mapToType: "cardio",
    icon: "trending-up-outline",
    kcalPerMinMedium: 8,
    defaultIntensity: "medium",
  },
  {
    key: "aerobics",
    label: "Aerobics",
    category: "cardio",
    mapToType: "cardio",
    icon: "heart-outline",
    kcalPerMinMedium: 7,
    defaultIntensity: "medium",
  },
  {
    key: "spin_class",
    label: "Spin Class",
    category: "cardio",
    mapToType: "hiit",
    icon: "bicycle-outline",
    kcalPerMinMedium: 11,
    defaultIntensity: "high",
  },

  // ─── STRENGTH ─────────────────────────────────────────────────────────────
  {
    key: "weight_lifting",
    label: "Weight Lifting",
    category: "strength",
    mapToType: "strength",
    icon: "barbell-outline",
    kcalPerMinMedium: 5,
    defaultIntensity: "medium",
  },
  {
    key: "powerlifting",
    label: "Powerlifting",
    category: "strength",
    mapToType: "strength",
    icon: "barbell-outline",
    kcalPerMinMedium: 6,
    defaultIntensity: "high",
  },
  {
    key: "bodyweight",
    label: "Bodyweight Training",
    category: "strength",
    mapToType: "strength",
    icon: "body-outline",
    kcalPerMinMedium: 5,
    defaultIntensity: "medium",
  },
  {
    key: "circuit_training",
    label: "Circuit Training",
    category: "strength",
    mapToType: "mixed",
    icon: "refresh-outline",
    kcalPerMinMedium: 8,
    defaultIntensity: "medium",
  },
  {
    key: "crossfit",
    label: "CrossFit",
    category: "strength",
    mapToType: "hiit",
    icon: "barbell-outline",
    kcalPerMinMedium: 10,
    defaultIntensity: "high",
  },
  {
    key: "kettlebell",
    label: "Kettlebell",
    category: "strength",
    mapToType: "mixed",
    icon: "barbell-outline",
    kcalPerMinMedium: 9,
    defaultIntensity: "medium",
  },
  {
    key: "resistance_bands",
    label: "Resistance Bands",
    category: "strength",
    mapToType: "strength",
    icon: "git-compare-outline",
    kcalPerMinMedium: 4,
    defaultIntensity: "low",
  },
  {
    key: "calisthenics",
    label: "Calisthenics",
    category: "strength",
    mapToType: "strength",
    icon: "body-outline",
    kcalPerMinMedium: 6,
    defaultIntensity: "medium",
  },

  // ─── HIIT ─────────────────────────────────────────────────────────────────
  {
    key: "hiit",
    label: "HIIT",
    category: "hiit",
    mapToType: "hiit",
    icon: "flash-outline",
    kcalPerMinMedium: 11,
    defaultIntensity: "high",
  },
  {
    key: "tabata",
    label: "Tabata",
    category: "hiit",
    mapToType: "hiit",
    icon: "timer-outline",
    kcalPerMinMedium: 13,
    defaultIntensity: "high",
  },
  {
    key: "bootcamp",
    label: "Bootcamp",
    category: "hiit",
    mapToType: "hiit",
    icon: "fitness-outline",
    kcalPerMinMedium: 10,
    defaultIntensity: "high",
  },
  {
    key: "plyometrics",
    label: "Plyometrics",
    category: "hiit",
    mapToType: "hiit",
    icon: "rocket-outline",
    kcalPerMinMedium: 10,
    defaultIntensity: "high",
  },
  {
    key: "burpees",
    label: "Burpees",
    category: "hiit",
    mapToType: "hiit",
    icon: "flame-outline",
    kcalPerMinMedium: 12,
    defaultIntensity: "high",
  },

  // ─── YOGA / FLEXIBILITY ───────────────────────────────────────────────────
  {
    key: "yoga_hatha",
    label: "Yoga (Hatha)",
    category: "yoga",
    mapToType: "yoga",
    icon: "leaf-outline",
    kcalPerMinMedium: 2.5,
    defaultIntensity: "low",
  },
  {
    key: "yoga_vinyasa",
    label: "Yoga (Vinyasa)",
    category: "yoga",
    mapToType: "yoga",
    icon: "leaf-outline",
    kcalPerMinMedium: 4,
    defaultIntensity: "medium",
  },
  {
    key: "yoga_power",
    label: "Yoga (Power)",
    category: "yoga",
    mapToType: "yoga",
    icon: "leaf-outline",
    kcalPerMinMedium: 5,
    defaultIntensity: "medium",
  },
  {
    key: "pilates",
    label: "Pilates",
    category: "yoga",
    mapToType: "yoga",
    icon: "body-outline",
    kcalPerMinMedium: 3.5,
    defaultIntensity: "low",
  },
  {
    key: "stretching",
    label: "Stretching",
    category: "yoga",
    mapToType: "yoga",
    icon: "accessibility-outline",
    kcalPerMinMedium: 2,
    defaultIntensity: "low",
  },
  {
    key: "barre",
    label: "Barre",
    category: "yoga",
    mapToType: "yoga",
    icon: "musical-note-outline",
    kcalPerMinMedium: 4,
    defaultIntensity: "medium",
  },
  {
    key: "tai_chi",
    label: "Tai Chi",
    category: "yoga",
    mapToType: "yoga",
    icon: "leaf-outline",
    kcalPerMinMedium: 3,
    defaultIntensity: "low",
  },
  {
    key: "foam_rolling",
    label: "Foam Rolling",
    category: "yoga",
    mapToType: "yoga",
    icon: "ellipse-outline",
    kcalPerMinMedium: 2,
    defaultIntensity: "low",
  },

  // ─── SPORTS ───────────────────────────────────────────────────────────────
  {
    key: "basketball",
    label: "Basketball",
    category: "sports",
    mapToType: "cardio",
    icon: "basketball-outline",
    kcalPerMinMedium: 8,
    defaultIntensity: "medium",
  },
  {
    key: "soccer",
    label: "Soccer",
    category: "sports",
    mapToType: "cardio",
    icon: "football-outline",
    kcalPerMinMedium: 9,
    defaultIntensity: "medium",
  },
  {
    key: "tennis",
    label: "Tennis",
    category: "sports",
    mapToType: "cardio",
    icon: "tennisball-outline",
    kcalPerMinMedium: 7,
    defaultIntensity: "medium",
  },
  {
    key: "pickleball",
    label: "Pickleball",
    category: "sports",
    mapToType: "cardio",
    icon: "tennisball-outline",
    kcalPerMinMedium: 6,
    defaultIntensity: "medium",
  },
  {
    key: "volleyball",
    label: "Volleyball",
    category: "sports",
    mapToType: "cardio",
    icon: "tennisball-outline",
    kcalPerMinMedium: 5,
    defaultIntensity: "medium",
  },
  {
    key: "badminton",
    label: "Badminton",
    category: "sports",
    mapToType: "cardio",
    icon: "tennisball-outline",
    kcalPerMinMedium: 6,
    defaultIntensity: "medium",
  },
  {
    key: "squash",
    label: "Squash",
    category: "sports",
    mapToType: "hiit",
    icon: "tennisball-outline",
    kcalPerMinMedium: 12,
    defaultIntensity: "high",
  },
  {
    key: "racquetball",
    label: "Racquetball",
    category: "sports",
    mapToType: "hiit",
    icon: "tennisball-outline",
    kcalPerMinMedium: 10,
    defaultIntensity: "high",
  },
  {
    key: "golf",
    label: "Golf",
    category: "sports",
    mapToType: "mixed",
    icon: "golf-outline",
    kcalPerMinMedium: 4,
    defaultIntensity: "low",
  },
  {
    key: "baseball",
    label: "Baseball / Softball",
    category: "sports",
    mapToType: "mixed",
    icon: "baseball-outline",
    kcalPerMinMedium: 5,
    defaultIntensity: "low",
  },
  {
    key: "hockey",
    label: "Hockey",
    category: "sports",
    mapToType: "cardio",
    icon: "ice-cream-outline",
    kcalPerMinMedium: 9,
    defaultIntensity: "medium",
  },
  {
    key: "rugby",
    label: "Rugby",
    category: "sports",
    mapToType: "cardio",
    icon: "american-football-outline",
    kcalPerMinMedium: 10,
    defaultIntensity: "high",
  },
  {
    key: "football",
    label: "American Football",
    category: "sports",
    mapToType: "mixed",
    icon: "american-football-outline",
    kcalPerMinMedium: 8,
    defaultIntensity: "medium",
  },
  {
    key: "table_tennis",
    label: "Table Tennis",
    category: "sports",
    mapToType: "cardio",
    icon: "tennisball-outline",
    kcalPerMinMedium: 4,
    defaultIntensity: "low",
  },

  // ─── OUTDOOR ──────────────────────────────────────────────────────────────
  {
    key: "hiking",
    label: "Hiking",
    category: "outdoor",
    mapToType: "cardio",
    icon: "trail-sign-outline",
    kcalPerMinMedium: 6,
    defaultIntensity: "medium",
  },
  {
    key: "rock_climbing",
    label: "Rock Climbing",
    category: "outdoor",
    mapToType: "mixed",
    icon: "triangle-outline",
    kcalPerMinMedium: 9,
    defaultIntensity: "medium",
  },
  {
    key: "mountain_biking",
    label: "Mountain Biking",
    category: "outdoor",
    mapToType: "cardio",
    icon: "bicycle-outline",
    kcalPerMinMedium: 10,
    defaultIntensity: "high",
  },
  {
    key: "skiing",
    label: "Skiing",
    category: "outdoor",
    mapToType: "cardio",
    icon: "snow-outline",
    kcalPerMinMedium: 8,
    defaultIntensity: "medium",
  },
  {
    key: "snowboarding",
    label: "Snowboarding",
    category: "outdoor",
    mapToType: "cardio",
    icon: "snow-outline",
    kcalPerMinMedium: 7,
    defaultIntensity: "medium",
  },
  {
    key: "rollerblading",
    label: "Rollerblading",
    category: "outdoor",
    mapToType: "cardio",
    icon: "bicycle-outline",
    kcalPerMinMedium: 8,
    defaultIntensity: "medium",
  },
  {
    key: "skateboarding",
    label: "Skateboarding",
    category: "outdoor",
    mapToType: "cardio",
    icon: "bicycle-outline",
    kcalPerMinMedium: 5,
    defaultIntensity: "medium",
  },
  {
    key: "surfing",
    label: "Surfing",
    category: "outdoor",
    mapToType: "mixed",
    icon: "water-outline",
    kcalPerMinMedium: 6,
    defaultIntensity: "medium",
  },

  // ─── WATER ────────────────────────────────────────────────────────────────
  {
    key: "swimming",
    label: "Swimming",
    category: "water",
    mapToType: "cardio",
    icon: "water-outline",
    kcalPerMinMedium: 9,
    defaultIntensity: "medium",
  },
  {
    key: "swimming_laps",
    label: "Swimming Laps",
    category: "water",
    mapToType: "cardio",
    icon: "water-outline",
    kcalPerMinMedium: 9,
    defaultIntensity: "medium",
  },
  {
    key: "water_aerobics",
    label: "Water Aerobics",
    category: "water",
    mapToType: "cardio",
    icon: "water-outline",
    kcalPerMinMedium: 5,
    defaultIntensity: "medium",
  },
  {
    key: "kayaking",
    label: "Kayaking",
    category: "water",
    mapToType: "cardio",
    icon: "boat-outline",
    kcalPerMinMedium: 5,
    defaultIntensity: "medium",
  },
  {
    key: "paddleboarding",
    label: "Paddleboarding",
    category: "water",
    mapToType: "mixed",
    icon: "boat-outline",
    kcalPerMinMedium: 4,
    defaultIntensity: "medium",
  },
  {
    key: "water_polo",
    label: "Water Polo",
    category: "water",
    mapToType: "cardio",
    icon: "water-outline",
    kcalPerMinMedium: 9,
    defaultIntensity: "high",
  },

  // ─── DANCE ────────────────────────────────────────────────────────────────
  {
    key: "zumba",
    label: "Zumba",
    category: "dance",
    mapToType: "cardio",
    icon: "musical-notes-outline",
    kcalPerMinMedium: 7,
    defaultIntensity: "medium",
  },
  {
    key: "dancing",
    label: "Dancing",
    category: "dance",
    mapToType: "cardio",
    icon: "musical-notes-outline",
    kcalPerMinMedium: 6,
    defaultIntensity: "medium",
  },
  {
    key: "salsa_dancing",
    label: "Salsa Dancing",
    category: "dance",
    mapToType: "cardio",
    icon: "musical-notes-outline",
    kcalPerMinMedium: 6,
    defaultIntensity: "medium",
  },
  {
    key: "hip_hop_dance",
    label: "Hip Hop Dance",
    category: "dance",
    mapToType: "cardio",
    icon: "musical-notes-outline",
    kcalPerMinMedium: 7,
    defaultIntensity: "medium",
  },
  {
    key: "ballet",
    label: "Ballet",
    category: "dance",
    mapToType: "yoga",
    icon: "musical-note-outline",
    kcalPerMinMedium: 5,
    defaultIntensity: "medium",
  },

  // ─── COMBAT ───────────────────────────────────────────────────────────────
  {
    key: "boxing",
    label: "Boxing",
    category: "combat",
    mapToType: "hiit",
    icon: "fitness-outline",
    kcalPerMinMedium: 11,
    defaultIntensity: "high",
  },
  {
    key: "kickboxing",
    label: "Kickboxing",
    category: "combat",
    mapToType: "hiit",
    icon: "fitness-outline",
    kcalPerMinMedium: 10,
    defaultIntensity: "high",
  },
  {
    key: "martial_arts",
    label: "Martial Arts",
    category: "combat",
    mapToType: "mixed",
    icon: "shield-outline",
    kcalPerMinMedium: 9,
    defaultIntensity: "medium",
  },
  {
    key: "judo",
    label: "Judo / Wrestling",
    category: "combat",
    mapToType: "mixed",
    icon: "shield-outline",
    kcalPerMinMedium: 9,
    defaultIntensity: "high",
  },
  {
    key: "mma",
    label: "MMA",
    category: "combat",
    mapToType: "hiit",
    icon: "shield-outline",
    kcalPerMinMedium: 11,
    defaultIntensity: "high",
  },

  // ─── MIXED / OTHER ────────────────────────────────────────────────────────
  {
    key: "general_workout",
    label: "General Workout",
    category: "mixed",
    mapToType: "mixed",
    icon: "body-outline",
    kcalPerMinMedium: 7,
    defaultIntensity: "medium",
  },
  {
    key: "sports_general",
    label: "Sports (general)",
    category: "mixed",
    mapToType: "mixed",
    icon: "football-outline",
    kcalPerMinMedium: 7,
    defaultIntensity: "medium",
  },
];

/** Activities shown in the "Quick Pick" row — most popular choices */
export const QUICK_PICK_KEYS: string[] = [
  "running",
  "walking",
  "weight_lifting",
  "cycling",
  "hiit",
  "yoga_vinyasa",
  "swimming",
  "basketball",
];

export const QUICK_PICK_ACTIVITIES: ExerciseActivity[] = QUICK_PICK_KEYS
  .map((k) => EXERCISE_ACTIVITIES.find((a) => a.key === k)!)
  .filter(Boolean);

/** Look up an activity by key */
export function getActivity(key: string): ExerciseActivity | undefined {
  return EXERCISE_ACTIVITIES.find((a) => a.key === key);
}

/**
 * Estimate kcal/min for a given activity and intensity.
 * Low  = 0.75 × medium rate
 * High = 1.30 × medium rate
 */
export function activityKcalPerMin(
  activity: ExerciseActivity,
  intensity: WorkoutEntry["intensity"]
): number {
  const multipliers: Record<WorkoutEntry["intensity"], number> = {
    low: 0.75,
    medium: 1.0,
    high: 1.3,
  };
  return activity.kcalPerMinMedium * multipliers[intensity];
}
