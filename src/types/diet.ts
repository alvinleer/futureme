import { MicronutrientKey } from "../data/micronutrients";

export interface Meal {
  id: string;
  description: string;
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  timestamp: number;
  servings?: number; // how many servings were logged (default 1)
  unit?: string; // unit label e.g. "serving", "g", "oz", "ml", "cup", "piece", "tbsp", "tsp"
  micronutrients?: Partial<Record<MicronutrientKey, number>>;
}

export interface DailyStats {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  mealCount: number;
}

export interface NutritionGoal {
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
}

export interface WeightGoal {
  currentWeight: number; // pounds
  targetWeight: number; // pounds
  startDate: number;
  weightHistory: WeightEntry[];
}

export interface WeightEntry {
  weight: number;
  date: number;
  bodyFatPercent?: number;
}

export interface WorkoutEntry {
  id: string;
  type: "strength" | "cardio" | "mixed" | "hiit" | "yoga";
  /** Specific activity key from exerciseActivities.ts (e.g. "running", "yoga_vinyasa") */
  activityKey?: string;
  durationMinutes: number;
  intensity: "low" | "medium" | "high";
  description?: string;
  timestamp: number;
  /** Set when this entry was created from a detailed workout session */
  sessionId?: string;
}

// ── Detailed workout sessions ───────────────────────────────────────────────
export interface ExerciseSet {
  /** Canonical pounds — converted for display when the user is on metric */
  weight?: number;
  reps?: number;
}

export interface LoggedExercise {
  id: string;
  /** Key into exerciseLibrary.ts (or a "custom_" key for user-typed names) */
  exerciseKey: string;
  name: string;
  metric: "weight_reps" | "reps" | "duration" | "distance_duration";
  sets: ExerciseSet[];
  durationMinutes?: number;
  /** Canonical miles */
  distance?: number;
  notes?: string;
}

export interface WorkoutSession {
  id: string;
  timestamp: number;
  title?: string;
  notes?: string;
  exercises: LoggedExercise[];
}

// ── Weekly workout plan ─────────────────────────────────────────────────────
/**
 * One exercise as *planned* for a weekday — the intent, not the record. Targets
 * are optional: a plan can be as loose as "bench press" or as precise as
 * "4 × 8 at 185". Weight stays in canonical pounds like everywhere else.
 */
export interface PlannedExercise {
  id: string;
  /** Key into exerciseLibrary.ts (or a "custom_" key for user-named moves) */
  exerciseKey: string;
  name: string;
  metric: "weight_reps" | "reps" | "duration" | "distance_duration";
  /** Target set count — drives how many blank set rows the log screen opens with */
  sets?: number;
  /** Target reps per set */
  reps?: number;
  /** Canonical pounds */
  targetWeight?: number;
  durationMinutes?: number;
  /** Canonical miles */
  distance?: number;
}

/**
 * A recurring workout day. One entry per weekday at most — `dayOfWeek` is the
 * identity of the plan, so saving Tuesday twice replaces it rather than
 * stacking up duplicates the user would have to clean out by hand.
 */
export interface WorkoutPlanDay {
  id: string;
  /** 0 = Sunday … 6 = Saturday, matching Date#getDay */
  dayOfWeek: number;
  title?: string;
  exercises: PlannedExercise[];
  updatedAt: number;
}

export interface WeeklyLogSummary {
  weekStartDate: number;
  weekEndDate: number;
  mealsLogged: number;
  daysWithMeals: number;
  workoutsLogged: number;
  avgDailyCalories: number;
  avgDailyProtein: number;
  totalWorkoutMinutes: number;
  isComplete: boolean; // true if has 5+ days of meals AND at least 1 workout
}

// Quick tracker types
export type TrackerType = "counter" | "boolean";
export type GoalDirection = "min" | "max"; // min = less than goal, max = more than goal

export interface TrackerConfig {
  id: string;
  name: string;
  icon: string; // Emoji or Ionicon name
  color: string;
  type: TrackerType;
  goal?: number; // For counter trackers (e.g., 8 glasses of water)
  goalDirection?: GoalDirection; // Whether goal is minimum or maximum
  unit?: string; // e.g. "glasses", "oz", "ml", "L"
  showOnHome: boolean;
  order: number;
  isBuiltIn?: boolean; // true = can be hidden but never deleted
}

export interface TrackerEntry {
  id: string;
  trackerId: string;
  value: number; // 1 for boolean (yes), count for counter
  timestamp: number;
  date: string; // YYYY-MM-DD format for easy grouping
}

// Progress photo types
export type PhotoAngle = "front" | "side" | "back";

export interface ProgressPhoto {
  id: string;
  uri: string;
  angle: PhotoAngle;
  timestamp: number;
}

// Favorite meal types
export interface FavoriteIngredientNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  micronutrients?: Partial<Record<string, number>>;
}

export interface FavoriteMeal {
  id: string;
  name: string; // user-chosen display name
  description: string; // original meal description
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  micronutrients?: Partial<Record<string, number>>;
  ingredients: string[];
  ingredientNutrition: FavoriteIngredientNutrition[];
  createdAt: number;
}

// Body measurement types
export interface BodyMeasurementEntry {
  id: string;
  bodyPart: string; // e.g. "Waist", "Biceps", custom
  value: number;
  unit: "cm" | "in";
  timestamp: number;
}
