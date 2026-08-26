// Onboarding types for the fitness goal setup flow
import { WorkoutEntry } from "./diet";

export type LifestyleActivity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type CardioIntensity = "light" | "moderate" | "intense";

export type LiftingLevel = "beginner" | "intermediate" | "advanced";

/** The two program lengths a user can pick at sign-up. Chosen once, then sealed. */
export type ProgramLengthWeeks = 12 | 24;

export const PROGRAM_LENGTH_OPTIONS: {
  weeks: ProgramLengthWeeks;
  label: string;
  tagline: string;
  description: string;
}[] = [
  {
    weeks: 12,
    label: "12 weeks",
    tagline: "Sprint",
    description: "Three months of focused change — visible results, fast feedback",
  },
  {
    weeks: 24,
    label: "24 weeks",
    tagline: "Transformation",
    description: "Six months for a deeper change — slower pace, bigger end result",
  },
];

/** Midnight today + N weeks. The goal date is sealed from this the moment you sign up. */
export function sealGoalDate(startDate: number, weeks: ProgramLengthWeeks): number {
  const end = new Date(startDate);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + weeks * 7);
  return end.getTime();
}

export interface OnboardingGoal {
  type: "lose" | "gain" | "other";
  otherDetail?: "healthier" | "stronger" | "faster";
  targetWeightKg: number;
  currentWeightKg: number;
  /** Program length in weeks — 12 or 24, chosen at sign-up */
  weeksToGoal: number;
  /** Day the program started. Fixed together with goalEndDate. */
  programStartDate: number;
  /** Sealed goal date: programStartDate + weeksToGoal. Never recomputed from "now". */
  goalEndDate: number; // timestamp
  /** Only set when type === "gain". Determines projected muscle gain rate. */
  liftingLevel?: LiftingLevel;
  /** Years actively training 2+ times/week without a lengthy break. Only for type === "gain". */
  trainingYears?: number;
}

export interface OnboardingStats {
  gender: "male" | "female" | "other";
  heightCm: number;
  weightKg: number;
  age: number;
  lifestyle: LifestyleActivity;
}

export interface OnboardingCalories {
  maintenanceCalories: number;
  targetCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  dailyDeficitOrSurplus: number;
}

export interface OnboardingWorkout {
  workoutType: "strength" | "cardio" | "mixed" | "hiit" | "yoga";
  workoutsPerWeek: number;
  minutesPerWorkout: number;
}

export interface OnboardingPhoto {
  beforePhotoUri: string | null;
  headshotPhotoUri: string | null;
}

// Activity profile for accurate TDEE calculation
// Separates daily NEAT (steps) from structured exercise
export interface ActivityProfile {
  dailySteps: number;                    // avg steps/day — NEAT proxy
  stepsSource: "manual" | "device";      // manual input or fitness device
  strengthSessionsPerWeek: number;       // 0–7
  cardioSessionsPerWeek: number;         // 0–7
  cardioMinutesPerSession: number;       // e.g. 30, 45, 60
  cardioIntensity: CardioIntensity;      // affects kcal/min estimate
  bodyFatPercent: number | null;         // optional — enables Katch-McArdle BMR
}

export const DEFAULT_ACTIVITY_PROFILE: ActivityProfile = {
  dailySteps: 7000,
  stepsSource: "manual",
  strengthSessionsPerWeek: 3,
  cardioSessionsPerWeek: 2,
  cardioMinutesPerSession: 30,
  cardioIntensity: "moderate",
  bodyFatPercent: null,
};

export interface OnboardingData {
  goal: OnboardingGoal | null;
  stats: OnboardingStats | null;
  calories: OnboardingCalories | null;
  workout: OnboardingWorkout | null;
  photo: OnboardingPhoto | null;
  currentStep: number;
  isComplete: boolean;
  completedAt: number | null;
  skippedAt: number | null;
  unitSystem: "metric" | "imperial";
  activityProfile: ActivityProfile;
}

// ─── BMR calculations ────────────────────────────────────────────────────────

export function calculateBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: "male" | "female" | "other"
): number {
  // Mifflin-St Jeor
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (gender === "male") return Math.round(base + 5);
  if (gender === "female") return Math.round(base - 161);
  return Math.round(base - 78); // "other" = average
}

export function calculateBMRKatchMcArdle(
  weightKg: number,
  bodyFatPercent: number
): number {
  // Katch-McArdle: more accurate when body fat % is known
  const leanMassKg = weightKg * (1 - bodyFatPercent / 100);
  return Math.round(370 + 21.6 * leanMassKg);
}

// ─── Accurate TDEE breakdown ─────────────────────────────────────────────────

export interface TDEEBreakdown {
  bmr: number;
  bmrMethod: "mifflin-st-jeor" | "katch-mcardle";
  stepCalories: number;          // daily NEAT from steps
  exerciseCalories: number;      // daily avg from structured workouts
  tdee: number;
}

export function calculateTDEEFromProfile(
  stats: OnboardingStats,
  profile: ActivityProfile
): TDEEBreakdown {
  // 1. BMR
  let bmr: number;
  let bmrMethod: TDEEBreakdown["bmrMethod"];
  if (profile.bodyFatPercent && profile.bodyFatPercent > 0 && profile.bodyFatPercent < 60) {
    bmr = calculateBMRKatchMcArdle(stats.weightKg, profile.bodyFatPercent);
    bmrMethod = "katch-mcardle";
  } else {
    bmr = calculateBMR(stats.weightKg, stats.heightCm, stats.age, stats.gender);
    bmrMethod = "mifflin-st-jeor";
  }

  // 2. Step-based NEAT: ~0.05 kcal/step is the midpoint of the 0.04–0.06 range
  const stepCalories = Math.round(profile.dailySteps * 0.05);

  // 3. Exercise expenditure
  //    Strength: 300 kcal/session (mid-range of 200–400)
  const strengthPerSession = 300;
  //    Cardio: kcal/min by intensity
  const cardioKcalPerMin: Record<CardioIntensity, number> = {
    light: 6,
    moderate: 9,
    intense: 12,
  };
  const cardioPerSession =
    cardioKcalPerMin[profile.cardioIntensity] * profile.cardioMinutesPerSession;

  const weeklyExercise =
    profile.strengthSessionsPerWeek * strengthPerSession +
    profile.cardioSessionsPerWeek * cardioPerSession;
  const exerciseCalories = Math.round(weeklyExercise / 7);

  const tdee = bmr + stepCalories + exerciseCalories;

  return { bmr, bmrMethod, stepCalories, exerciseCalories, tdee };
}

// ─── Per-workout calorie estimate ────────────────────────────────────────────

import { getActivity, activityKcalPerMin } from "../data/exerciseActivities";

const WORKOUT_KCAL_PER_MIN: Record<WorkoutEntry["type"], Record<WorkoutEntry["intensity"], number>> = {
  cardio:   { low: 6,  medium: 9,  high: 12 },
  strength: { low: 5,  medium: 7,  high: 9  },
  hiit:     { low: 8,  medium: 10, high: 13 },
  yoga:     { low: 2,  medium: 3,  high: 4  },
  mixed:    { low: 5,  medium: 8,  high: 10 },
};

export function estimateWorkoutCalories(workout: WorkoutEntry): number {
  // If a specific activity key is present, use its precise kcal/min rate
  if (workout.activityKey) {
    const activity = getActivity(workout.activityKey);
    if (activity) {
      const rate = activityKcalPerMin(activity, workout.intensity);
      return Math.round(rate * workout.durationMinutes);
    }
  }
  const rate = WORKOUT_KCAL_PER_MIN[workout.type]?.[workout.intensity] ?? 7;
  return Math.round(rate * workout.durationMinutes);
}

/**
 * Returns the calorie bonus earned from actual activity logged today.
 * Exercise always adds to the goal — never reduces it.
 * Steps: add calories for steps logged above the profile baseline (floored at 0).
 * Workouts: add the full calories burned for every session logged today.
 */
export function calculateDailyActivityAdjustment(
  profile: ActivityProfile,
  actualSteps: number | null,  // null = no explicit entry → no adjustment
  dayWorkouts: WorkoutEntry[]
): number {
  // Step bonus: only when explicitly logged, and only for steps above the baseline
  const stepAdjustment = actualSteps !== null
    ? Math.max(0, Math.round((actualSteps - profile.dailySteps) * 0.05))
    : 0;

  // Workout bonus: add the full calories for every workout logged today (always >= 0)
  const workoutCalories = dayWorkouts.reduce((sum, w) => sum + estimateWorkoutCalories(w), 0);

  return stepAdjustment + workoutCalories;
}

// ─── Water intake goal ────────────────────────────────────────────────────────

/**
 * Calculates recommended daily water intake in liters.
 * Formula:
 *   base = 0.033 × weightKg × genderFactor
 *   genderFactor = 1.1 for men, 1.0 for women/other
 *   activityWater = Σ (workout.durationMinutes / 60) × activityFactor
 *   activityFactor: low=0.3, medium=0.4, high=0.7 L/hr
 */
export function calculateWaterGoalLiters(
  weightKg: number,
  gender: "male" | "female" | "other",
  workoutsToday: WorkoutEntry[]
): number {
  if (weightKg <= 0) return 2.0; // sensible fallback
  const genderFactor = gender === "male" ? 1.1 : 1.0;
  const base = 0.033 * weightKg * genderFactor;

  const activityFactors: Record<string, number> = {
    low: 0.3,
    medium: 0.4,
    high: 0.7,
  };
  const activityWater = workoutsToday.reduce((sum, w) => {
    const hours = w.durationMinutes / 60;
    const factor = activityFactors[w.intensity] ?? 0.4;
    return sum + hours * factor;
  }, 0);

  return Math.round((base + activityWater) * 10) / 10; // 1 decimal place
}

/**
 * Converts a water volume in liters to the given tracker unit.
 */
export function convertWaterLitersToUnit(liters: number, unit: string): number {
  switch (unit) {
    case "L":
      return Math.round(liters * 10) / 10;
    case "ml":
      return Math.round(liters * 1000);
    case "oz":
      return Math.round(liters / 0.02957);
    case "cups":
      return Math.round(liters / 0.2366);
    case "glasses":
    default:
      return Math.round(liters / 0.25);
  }
}

// ─── Legacy helper (kept for backward compat) ─────────────────────────────

export function getActivityMultiplier(lifestyle: LifestyleActivity): number {
  const multipliers: Record<LifestyleActivity, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };
  return multipliers[lifestyle];
}

export function calculateTDEE(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: "male" | "female" | "other",
  lifestyle: LifestyleActivity
): number {
  const bmr = calculateBMR(weightKg, heightCm, age, gender);
  return Math.round(bmr * getActivityMultiplier(lifestyle));
}

// ─── Goal adjustment ──────────────────────────────────────────────────────────

export function calculateRecommendedCalories(
  tdee: number,
  goalType: "lose" | "gain" | "other",
  weeklyChangeKg: number
): { targetCalories: number; deficitOrSurplus: number } {
  const dailyChange = (weeklyChangeKg * 7700) / 7;

  if (goalType === "lose") {
    const deficit = Math.min(Math.max(dailyChange, 300), 800);
    return {
      targetCalories: Math.max(1200, Math.round(tdee - deficit)),
      deficitOrSurplus: -deficit,
    };
  } else if (goalType === "gain") {
    const surplus = Math.min(Math.max(dailyChange, 200), 500);
    return {
      targetCalories: Math.round(tdee + surplus),
      deficitOrSurplus: surplus,
    };
  }

  return { targetCalories: tdee, deficitOrSurplus: 0 };
}

// ─── Macros ───────────────────────────────────────────────────────────────────

export function calculateMacros(
  targetCalories: number,
  weightKg: number,
  goalType: "lose" | "gain" | "other"
): { protein: number; carbs: number; fat: number } {
  if (goalType === "gain") {
    // Muscle gain: protein 2.0 g/kg, fat 0.85 g/kg, carbs fill the rest
    const protein = Math.round(weightKg * 2.0);
    const fat = Math.round(weightKg * 0.85);
    const remainingCals = Math.max(0, targetCalories - protein * 4 - fat * 9);
    const carbs = Math.round(remainingCals / 4);
    return { protein, carbs, fat };
  }

  // Weight loss & maintenance: protein 2 g/kg, carbs and fat split 50/50
  const protein = Math.round(weightKg * 2);
  const remainingCals = Math.max(0, targetCalories - protein * 4);
  const carbs = Math.round((remainingCals * 0.5) / 4);
  const fat = Math.round((remainingCals * 0.5) / 9);

  return { protein, carbs, fat };
}
