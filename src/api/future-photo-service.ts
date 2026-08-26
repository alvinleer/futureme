/**
 * Future Self Visualization Service
 *
 * Uses Gemini 3.1 Flash Image Preview (Nano Banana 2) with native image generation.
 * Sends the user's photo + goal prompt → Gemini returns the transformed image directly.
 */
import * as FileSystem from "expo-file-system/legacy";
import { UserProfile, WorkoutStats, VisualizationResult, ComplianceMetrics } from "../types/futurePhoto";
import { NutritionGoal, WeightGoal, Meal, WorkoutEntry } from "../types/diet";
import { removeBackground } from "./remove-background";
import {
  ProteinAdherence,
  PROTEIN_HIT_RATIO,
  PROTEIN_LOW_RATIO,
  calculateProteinAdherence,
  proteinAdherenceFromAverage,
  proteinQualityFactor,
} from "../utils/protein";
import { useAuthStore } from "../state/authStore";
import { fetchWithAuthRefresh as fetchWithTokenRefresh } from "./auth-fetch";

const BACKEND_URL = (process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

// ─── Shared Sunday key helper ─────────────────────────────────────────────────

/** Returns the ISO-style key for the Sunday that starts the current week. */
export function getCurrentWeekSundayKey(): string {
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() - d.getDay()); // rewind to Sunday
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Returns true when a new generation should be triggered:
 * - It is Sunday ≥ 09:00 local time, OR the current week's Sunday 09:00 has
 *   already passed (Mon–Sat), AND we have not yet generated for this week.
 * - Also returns true if the photo has never been generated at all.
 */
export function shouldGenerateThisWeek(weeklyGenerationKey: string | null): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const hour = now.getHours();
  const currentKey = getCurrentWeekSundayKey();

  // Already generated this week
  if (weeklyGenerationKey === currentKey) return false;

  // Never generated — allow immediately
  if (!weeklyGenerationKey) return true;

  // Sunday before 9 am — not yet time
  if (dayOfWeek === 0 && hour < 9) return false;

  // Sunday ≥ 9 am, or any Mon–Sat (Sunday 9 am window has passed)
  return true;
}

// ─── Compliance calculator ────────────────────────────────────────────────────

export function calculateComplianceMetrics(
  meals: Meal[],
  workouts: WorkoutEntry[],
  nutritionGoal: NutritionGoal,
  workoutStats: WorkoutStats,
  weightGoal?: WeightGoal
): ComplianceMetrics {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const recentMeals = meals.filter((m) => m.timestamp >= sevenDaysAgo);
  const recentWorkouts = workouts.filter((w) => w.timestamp >= sevenDaysAgo);

  const isGaining = weightGoal && weightGoal.currentWeight > 0
    && weightGoal.targetWeight > weightGoal.currentWeight;
  const isLosing = weightGoal && weightGoal.currentWeight > 0
    && weightGoal.targetWeight < weightGoal.currentWeight;

  const caloriesByDay = new Map<string, number>();
  recentMeals.forEach((meal) => {
    const day = new Date(meal.timestamp).toDateString();
    caloriesByDay.set(day, (caloriesByDay.get(day) ?? 0) + meal.calories);
  });

  // Only evaluate days the user actually tracked — unlogged days are excluded
  const trackedDays = caloriesByDay.size;

  let calorieComplianceDays = 0;
  caloriesByDay.forEach((dayCalories) => {
    const target = nutritionGoal.dailyCalories;
    if (isGaining) {
      if (dayCalories >= target * 0.9) calorieComplianceDays++;
    } else if (isLosing) {
      if (dayCalories <= target * 1.1) calorieComplianceDays++;
    } else {
      if (Math.abs(dayCalories - target) <= target * 0.15) calorieComplianceDays++;
    }
  });

  const workoutDays = new Set(
    recentWorkouts.map((w) => new Date(w.timestamp).toDateString())
  ).size;

  // Expected workouts is per-week (not per-two-weeks) since the window is now 7 days
  const expectedWorkoutDays = Math.max(1, Math.round(workoutStats.avgWorkoutsPerWeek));

  const protein = calculateProteinAdherence(meals, nutritionGoal.dailyProtein);

  // Calorie compliance: out of tracked days only (not the full 7-day calendar)
  const calorieCompliance = trackedDays > 0 ? (calorieComplianceDays / trackedDays) * 100 : 0;
  const workoutCompliance = Math.min(100, (workoutDays / expectedWorkoutDays) * 100);

  // Weighted so the score says what the app says: calories first, protein
  // second, training third.
  const complianceRate = Math.round(
    calorieCompliance * 0.5 + protein.hitRatePct * 0.3 + workoutCompliance * 0.2
  );

  return {
    complianceRate,
    calorieComplianceDays,
    proteinComplianceDays: protein.daysHit,
    avgDailyProtein: Math.round(protein.avgDailyG),
    proteinCompliance: Math.round(protein.hitRatePct),
    workoutDays,
    expectedWorkoutDays,
  };
}

// ─── Weeks helper ─────────────────────────────────────────────────────────────

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function calculateWeeksRemaining(goalEndDate: number): number {
  const msRemaining = goalEndDate - Date.now();
  return Math.max(0, Math.round(msRemaining / MS_PER_WEEK));
}

// ─── Last week's progress → projection to the sealed goal date ───────────────

/**
 * What last week actually looked like, expressed as an average daily calorie
 * balance against maintenance. Positive = deficit, negative = surplus.
 *
 * "logged" means the number came from meals the user actually logged in the
 * last 7 days; "plan" is the fallback used before there is enough data
 * (fewer than 3 logged days), which assumes the user follows their plan.
 */
export interface WeeklyProgressBasis {
  dailyBalanceKcal: number;
  daysLogged: number;
  source: "logged" | "plan";
}

export function calculateLastWeekBasis(
  meals: Meal[],
  maintenanceCalories: number,
  plannedDailyBalanceKcal: number
): WeeklyProgressBasis {
  const sevenDaysAgo = Date.now() - MS_PER_WEEK;
  const caloriesByDay = new Map<string, number>();
  meals
    .filter((m) => m.timestamp >= sevenDaysAgo)
    .forEach((meal) => {
      const day = new Date(meal.timestamp).toDateString();
      caloriesByDay.set(day, (caloriesByDay.get(day) ?? 0) + meal.calories);
    });

  const daysLogged = caloriesByDay.size;

  // Too little data to read a trend from — fall back to the plan
  if (daysLogged < 3 || maintenanceCalories <= 0) {
    return { dailyBalanceKcal: plannedDailyBalanceKcal, daysLogged, source: "plan" };
  }

  let totalIntake = 0;
  caloriesByDay.forEach((cals) => {
    totalIntake += cals;
  });
  const avgDailyIntake = totalIntake / daysLogged;

  return {
    dailyBalanceKcal: maintenanceCalories - avgDailyIntake,
    daysLogged,
    source: "logged",
  };
}

export interface GoalDateProjection {
  /** kg of change still expected between today and the sealed goal date */
  projectedKg: number;
  /** True when the projection is a fat-loss projection */
  isLosing: boolean;
  weeksRemaining: number;
  basis: WeeklyProgressBasis;
}

/**
 * Projects body change from today through to the sealed goal date by carrying
 * last week's calorie balance forward for every remaining week.
 *
 * If last week ran counter to the goal (eating in a surplus while trying to
 * lose, or vice versa), no change is projected — the photo then shows the user
 * roughly as they are today rather than an inverted transformation.
 */
export function projectAtGoalDate(params: {
  meals: Meal[];
  maintenanceCalories: number;
  plannedDailyBalanceKcal: number;
  goalEndDate: number;
  goalIsLosing: boolean;
}): GoalDateProjection {
  const { meals, maintenanceCalories, plannedDailyBalanceKcal, goalEndDate, goalIsLosing } = params;

  const basis = calculateLastWeekBasis(meals, maintenanceCalories, plannedDailyBalanceKcal);
  const weeksRemaining = calculateWeeksRemaining(goalEndDate);

  // Deficit while losing, or surplus while gaining, counts as progress
  const balanceMatchesGoal = goalIsLosing
    ? basis.dailyBalanceKcal > 0
    : basis.dailyBalanceKcal < 0;

  const projectedKg = balanceMatchesGoal
    ? Math.abs(basis.dailyBalanceKcal) * 7 * weeksRemaining / 7700
    : 0;

  return { projectedKg, isLosing: goalIsLosing, weeksRemaining, basis };
}

// ─── Body fat % projection (Mifflin-St Jeor + Deurenberg) ────────────────────

/**
 * Estimates initial body fat % using the Deurenberg BMI-based formula, then
 * applies the Mifflin-St Jeor TDEE model and 7,700 kcal/kg rule to predict
 * final body fat % at the end of the goal timeframe.
 *
 * Returns null if any required input is missing or invalid.
 */
export function calculateBodyFatProjection(params: {
  weightKg: number;
  heightCm: number;
  ageyears: number;
  gender: "male" | "female" | "other";
  avgWorkoutsPerWeek: number;
  dailyDeficitKcal: number;
  weeksTotal: number;
  /** 0.5–1 from `proteinQualityFactor`. 1 preserves all lean mass. */
  proteinFactor?: number;
}): { initialBF: number; finalBF: number } | null {
  const { weightKg, heightCm, ageyears, gender, avgWorkoutsPerWeek, dailyDeficitKcal, weeksTotal } = params;
  const proteinFactor = Math.min(1, Math.max(0.5, params.proteinFactor ?? 1));

  if (weightKg <= 0 || heightCm <= 0 || ageyears <= 0 || weeksTotal <= 0) return null;

  // 1. Estimate initial BF% via Deurenberg formula
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  let initialBF: number;
  if (gender === "male") {
    initialBF = 1.2 * bmi + 0.23 * ageyears - 16.2;
  } else if (gender === "female") {
    initialBF = 1.2 * bmi + 0.23 * ageyears - 5.4;
  } else {
    // average of male/female formulas
    initialBF = 1.2 * bmi + 0.23 * ageyears - 10.8;
  }
  initialBF = Math.min(60, Math.max(5, initialBF));

  // 2. Activity factor from workouts/week
  let af: number;
  if (avgWorkoutsPerWeek >= 6) af = 1.725;
  else if (avgWorkoutsPerWeek >= 4) af = 1.55;
  else if (avgWorkoutsPerWeek >= 2) af = 1.375;
  else af = 1.2;

  // 3. Mifflin-St Jeor RMR (activity factor af is computed for potential future use)
  const rmr = gender === "female"
    ? 10 * weightKg + 6.25 * heightCm - 5 * ageyears - 161
    : 10 * weightKg + 6.25 * heightCm - 5 * ageyears + 5;
  void (rmr * af); // TDEE computed but projection uses stated deficit directly

  // 5. Total mass lost = deficit × 7 days × weeks / 7700 kcal per kg
  const deltaMass = Math.max(0, (dailyDeficitKcal * 7 * weeksTotal) / 7700);

  // Protein decides how much of that loss is fat. At full protein it is all
  // fat; at the floor, up to 30% comes off as lean mass — same scale reading,
  // a visibly softer body.
  const leanLossShare = 0.3 * (1 - proteinFactor) * 2; // proteinFactor 0.5 → 0.3
  const deltaFM = deltaMass * (1 - leanLossShare);

  // 6. Initial fat mass
  const initialFatMass = weightKg * (initialBF / 100);

  // 7. Final body weight and fat mass
  const finalWeight = Math.max(weightKg * 0.6, weightKg - deltaMass);
  const finalFatMass = Math.max(initialFatMass * 0.1, initialFatMass - deltaFM);

  // 8. Final BF%
  const finalBF = Math.min(initialBF, Math.max(3, (finalFatMass / finalWeight) * 100));

  return { initialBF: Math.round(initialBF * 10) / 10, finalBF: Math.round(finalBF * 10) / 10 };
}

// ─── Muscle gain projection (Alan Aragon Model) ───────────────────────────────

export interface MuscleGainProjection {
  initialBF: number;
  finalBF: number;
  lbmGainKg: number;
  fatGainKg: number;
  currentWeightKg: number;
  finalWeightKg: number;
}

/**
 * Projects lean body mass and fat gain using the Alan Aragon Model:
 *   Beginner     1–1.5 % of body weight / month
 *   Intermediate 0.5–1 % of body weight / month
 *   Advanced     0.25–0.5 % of body weight / month
 *
 * Fat gain: 1:1 ratio with muscle when in a caloric surplus, 0 at maintenance.
 * Initial BF% is estimated via the Deurenberg BMI formula.
 */
export function calculateMuscleGainProjection(params: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  gender: "male" | "female" | "other";
  liftingLevel: "beginner" | "intermediate" | "advanced";
  trainingYears?: number;
  dailySurplusKcal: number;
  weeksTotal: number;
  /** 0.5–1 from `proteinQualityFactor`. Scales how much of the gain is muscle. */
  proteinFactor?: number;
}): MuscleGainProjection | null {
  const { weightKg, heightCm, ageYears, gender, liftingLevel, trainingYears, dailySurplusKcal, weeksTotal } = params;
  const proteinFactor = Math.min(1, Math.max(0.5, params.proteinFactor ?? 1));

  if (weightKg <= 0 || heightCm <= 0 || ageYears <= 0 || weeksTotal <= 0) return null;

  // 1. Estimate initial BF% via Deurenberg
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  let initialBF: number;
  if (gender === "male") {
    initialBF = 1.2 * bmi + 0.23 * ageYears - 16.2;
  } else if (gender === "female") {
    initialBF = 1.2 * bmi + 0.23 * ageYears - 5.4;
  } else {
    initialBF = 1.2 * bmi + 0.23 * ageYears - 10.8;
  }
  initialBF = Math.min(60, Math.max(5, initialBF));

  // 2. Alan Aragon monthly gain rate — refined by actual training years
  const yrs = trainingYears ?? (liftingLevel === "beginner" ? 0.5 : liftingLevel === "intermediate" ? 2 : 4);
  let monthlyGainPct: number;
  if (liftingLevel === "beginner") {
    monthlyGainPct = yrs < 0.5 ? 1.5 : yrs < 1 ? 1.25 : 1.0;
  } else if (liftingLevel === "intermediate") {
    monthlyGainPct = yrs <= 2 ? 0.9 : 0.65;
  } else {
    monthlyGainPct = yrs <= 5 ? 0.45 : 0.3;
  }

  // 3. Total LBM the surplus could build, then what protein actually supports
  const months = weeksTotal / 4.33;
  const potentialLbmGainKg = (monthlyGainPct / 100) * weightKg * months;
  const lbmGainKg = potentialLbmGainKg * proteinFactor;

  // 4. Fat gained tracks the surplus, not the muscle: the calories land either
  // way, so muscle protein fails to build turns into fat instead.
  const fatGainKg = dailySurplusKcal > 0 ? potentialLbmGainKg : 0;

  // 5. Final composition
  const initialFatMass = weightKg * (initialBF / 100);
  const finalWeightKg = weightKg + lbmGainKg + fatGainKg;
  const finalFatMass = initialFatMass + fatGainKg;
  const finalBF = Math.max(3, (finalFatMass / finalWeightKg) * 100);

  return {
    initialBF: Math.round(initialBF * 10) / 10,
    finalBF: Math.round(finalBF * 10) / 10,
    lbmGainKg: Math.round(lbmGainKg * 10) / 10,
    fatGainKg: Math.round(fatGainKg * 10) / 10,
    currentWeightKg: Math.round(weightKg * 10) / 10,
    finalWeightKg: Math.round(finalWeightKg * 10) / 10,
  };
}

/** Parses a height string like "175", "175 cm", "5'9\"", "5ft 9in" → cm */
export function parseHeightToCm(height: string): number | null {
  if (!height) return null;
  const trimmed = height.trim();

  // Already a plain number or "XXX cm"
  const cmMatch = trimmed.match(/^(\d+(\.\d+)?)\s*(cm)?$/i);
  if (cmMatch) return parseFloat(cmMatch[1]);

  // Feet/inches: 5'9", 5ft9in, 5 ft 9 in
  const ftInMatch = trimmed.match(/^(\d+)\s*(?:ft|'|feet)?\s*(\d+)\s*(?:in|"|inches)?$/i);
  if (ftInMatch) return Math.round(parseInt(ftInMatch[1]) * 30.48 + parseInt(ftInMatch[2]) * 2.54);

  // Feet only: "6ft", "6'"
  const ftOnlyMatch = trimmed.match(/^(\d+(\.\d+)?)\s*(?:ft|'|feet)$/i);
  if (ftOnlyMatch) return Math.round(parseFloat(ftOnlyMatch[1]) * 30.48);

  return null;
}

// ─── Gemini image generation helper ───────────────────────────────────────────

/**
 * Nano Banana 2 — Gemini 3.1 Flash Image Preview with native image generation.
 * Sends user's photo + projected body-change prompt → returns transformed image.
 */
async function generateWithGemini(
  photoUri: string,
  projectedKg: number,
  isLosing: boolean,
  bodyFat?: { initialBF: number; finalBF: number },
  muscleGain?: MuscleGainProjection,
  firstTimeGoal?: { isLosing: boolean; currentBFPercent?: number; targetBFPercent?: number; leanMassGainKg?: number },
  currentWeightKg?: number,
  protein?: ProteinAdherence
): Promise<string> {
  if (!useAuthStore.getState().token) throw new Error("Not authenticated.");

  const fileInfo = await FileSystem.getInfoAsync(photoUri);
  if (!fileInfo.exists) {
    throw new Error("Your before photo could not be found. Please go back and re-upload it in your profile settings.");
  }

  const base64Image = await FileSystem.readAsStringAsync(photoUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const ext = photoUri.split(".").pop()?.toLowerCase();
  const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  // Protein is what decides whether the change reads as muscle or just a
  // smaller/bigger version of the same body, so it goes into the prompt.
  const proteinNote =
    protein && protein.hasData
      ? protein.ratio >= PROTEIN_HIT_RATIO
        ? " Muscle should look full and well defined — protein intake has been consistently high."
        : protein.ratio >= PROTEIN_LOW_RATIO
        ? " Muscle definition should look only moderate — protein intake has been below target."
        : " Muscle should look soft and undefined — protein intake has been well below target."
      : "";

  let prompt: string;

  if (!isLosing) {
    // Muscle gain: compute target lean mass
    const muscleKg = muscleGain?.lbmGainKg ?? firstTimeGoal?.leanMassGainKg ?? projectedKg;
    const weightKg = currentWeightKg ?? 75;
    // Rough current lean mass: assume ~20% BF as fallback if no BF data
    const currentLeanMass = weightKg * 0.8;
    const targetLeanMass = currentLeanMass + muscleKg;

    prompt = `Show what this person would look like with ${targetLeanMass.toFixed(1)} kg of lean muscle mass. Keep the face, hair, clothing, and background exactly the same — only the body composition should change.${proteinNote} Render it as a real, natural-looking photograph.`;
  } else {
    // Fat loss: compute target BF% and lean mass
    let targetBF: number;
    let leanMass: number;

    if (bodyFat && currentWeightKg) {
      targetBF = bodyFat.finalBF;
      leanMass = currentWeightKg * (1 - bodyFat.initialBF / 100);
    } else if (firstTimeGoal?.targetBFPercent != null && firstTimeGoal?.currentBFPercent != null && currentWeightKg) {
      targetBF = firstTimeGoal.targetBFPercent;
      leanMass = currentWeightKg * (1 - firstTimeGoal.currentBFPercent / 100);
    } else {
      // Fallback: estimate from projectedKg weight loss
      const weightKg = currentWeightKg ?? 75;
      targetBF = Math.max(8, 25 - projectedKg);
      leanMass = weightKg * 0.75;
    }

    prompt = `Show what this person would look like at ${targetBF.toFixed(1)}% body fat with ${leanMass.toFixed(1)} kg of lean mass. Keep the face, hair, clothing, and background exactly the same — only the body composition should change.${proteinNote} Render it as a real, natural-looking photograph.`;
  }

  const res = await fetchWithTokenRefresh(`${BACKEND_URL}/api/ai/gemini/generate-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64Image, mimeType, prompt }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini generation failed: ${errText.slice(0, 200)}`);
  }

  const result = await res.json() as { imageBase64?: string; error?: string };
  if (!result.imageBase64) {
    throw new Error(result.error ?? "No image returned from Gemini.");
  }

  const imageData = result.imageBase64;

  const outputPath = `${FileSystem.documentDirectory}future_self_${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(outputPath, imageData, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Remove background from the generated photo so it displays cleanly
  const finalPath = await removeBackground(outputPath).catch(() => outputPath);

  return finalPath;
}

// ─── Main generation function ─────────────────────────────────────────────────

export interface GenerateVisualizationParams {
  userProfile: UserProfile;
  workoutStats: WorkoutStats;
  beforePhotoUri: string;
  goalEndDate: number;
  totalWeeks: number;
  meals: Meal[];
  workouts: WorkoutEntry[];
  nutritionGoal: NutritionGoal;
  weightGoal: WeightGoal;
  /** TDEE estimate — last week's intake is measured against this */
  maintenanceCalories: number;
  deviceId: string;
  forceRegenerate?: boolean;
  /** From OnboardingGoal — only used when goal type is "gain" */
  liftingLevel?: "beginner" | "intermediate" | "advanced";
  trainingYears?: number;
}

export async function generateVisualization(
  params: GenerateVisualizationParams
): Promise<VisualizationResult> {
  const { userProfile, workoutStats, beforePhotoUri, meals, workouts, nutritionGoal, weightGoal, maintenanceCalories, goalEndDate, liftingLevel, trainingYears } = params;

  const compliance = calculateComplianceMetrics(meals, workouts, nutritionGoal, workoutStats, weightGoal);

  const heightCm = userProfile ? parseHeightToCm(userProfile.height) : null;
  const weightKg = weightGoal.currentWeight / 2.205;

  // The horizon is always the sealed goal date, and the rate always comes from
  // the week just gone — so the photo answers "who am I on that date if last
  // week is how I keep going?"
  const goalIsLosing =
    weightGoal.currentWeight > 0 && weightGoal.targetWeight < weightGoal.currentWeight;
  const plannedDailyBalanceKcal = maintenanceCalories > 0
    ? maintenanceCalories - nutritionGoal.dailyCalories
    : 0;

  const projection = projectAtGoalDate({
    meals,
    maintenanceCalories,
    plannedDailyBalanceKcal,
    goalEndDate,
    goalIsLosing,
  });

  const projectedKg = projection.projectedKg;
  const isLosing = projection.isLosing;
  const weeklyBalanceKcal = projection.basis.dailyBalanceKcal * 7;
  // Body-composition models run over exactly the weeks that are left
  const projectionWeeks = Math.max(1, projection.weeksRemaining);

  // Protein is the second lever: same calories, very different body depending
  // on whether the protein target was hit last week.
  const protein = calculateProteinAdherence(meals, nutritionGoal.dailyProtein);
  const proteinFactor = proteinQualityFactor(protein);

  let bodyFat: { initialBF: number; finalBF: number } | undefined;
  let muscleGain: MuscleGainProjection | undefined;

  if (heightCm && weightKg > 0 && userProfile) {
    if (isLosing) {
      bodyFat = calculateBodyFatProjection({
        weightKg,
        heightCm,
        ageyears: userProfile.age,
        gender: userProfile.gender,
        avgWorkoutsPerWeek: workoutStats.avgWorkoutsPerWeek,
        dailyDeficitKcal: weeklyBalanceKcal / 7,
        weeksTotal: projectionWeeks,
        proteinFactor,
      }) ?? undefined;
    } else if (liftingLevel) {
      // Surplus = actual surplus kcal/day (negative weeklyBalanceKcal means eating more than goal)
      const dailySurplusKcal = -(weeklyBalanceKcal / 7);
      muscleGain = calculateMuscleGainProjection({
        weightKg,
        heightCm,
        ageYears: userProfile.age,
        gender: userProfile.gender,
        liftingLevel,
        trainingYears,
        dailySurplusKcal,
        weeksTotal: projectionWeeks,
        proteinFactor,
      }) ?? undefined;
    }
  }

  const finalPath = await generateWithGemini(beforePhotoUri, projectedKg, isLosing, bodyFat, muscleGain, undefined, weightKg, protein);

  return {
    imageUrl: finalPath,
    denoisingStrength: 0.45,
    complianceRate: compliance.complianceRate,
    progressScore: 0,
    generatedAt: new Date().toISOString(),
    cached: false,
  };
}

/** @deprecated Use shouldGenerateThisWeek instead */
export function shouldRegeneratePrediction(lastGeneratedAt: number | null): boolean {
  if (!lastGeneratedAt) return true;
  return Date.now() - lastGeneratedAt >= 7 * 24 * 60 * 60 * 1000;
}

// ─── Legacy compat (used by OnboardingFutureYouScreen) ────────────────────────

export interface LegacyGenerationParams {
  userProfile: UserProfile;
  workoutStats: WorkoutStats;
  referenceImages?: string[];
  nutritionGoal: NutritionGoal;
  weightGoal: WeightGoal;
  maintenanceCalories: number;
  goalEndDate: number;
  weeklyLogSummary: { avgDailyCalories: number; avgDailyProtein: number; totalWorkoutMinutes: number; daysWithMeals: number; workoutsLogged: number };
  consecutiveCompleteWeeks: number;
  weeklyProgress?: unknown;
  /** From OnboardingGoal — only used when goal type is "gain" */
  liftingLevel?: "beginner" | "intermediate" | "advanced";
  trainingYears?: number;
}

export async function generateFuturePhoto(
  params: LegacyGenerationParams
): Promise<{ imageUrl: string; predictionData: { isComplete: boolean; weeksFromNow: number; projectedWeightChange: number; dailyDeficitOrSurplus: number; weeklyWorkoutHours: number; confidenceLevel: string; message?: string } }> {
  const { userProfile, workoutStats, referenceImages, weightGoal, goalEndDate, nutritionGoal, weeklyLogSummary, liftingLevel, trainingYears } = params;

  const weeksFromNow = calculateWeeksRemaining(goalEndDate);

  if (!referenceImages || referenceImages.length === 0) {
    return {
      imageUrl: "",
      predictionData: {
        isComplete: false,
        weeksFromNow,
        projectedWeightChange: 0,
        dailyDeficitOrSurplus: 0,
        weeklyWorkoutHours: 0,
        confidenceLevel: "No data",
        message: "Please upload a photo to see your fitness visualization",
      },
    };
  }

  const avgDailyActual = weeklyLogSummary.avgDailyCalories;
  const daysWithData = weeklyLogSummary.daysWithMeals;
  const maintenance = params.maintenanceCalories;

  // Always project all the way out to the sealed goal date. The rate comes from
  // last week when there is enough of it, otherwise from the plan.
  const hasLoggedWeek = daysWithData >= 3 && avgDailyActual > 0;
  const plannedDailyBalanceKcal = maintenance > 0 ? maintenance - nutritionGoal.dailyCalories : 0;
  const dailyDeficitKcal = hasLoggedWeek && maintenance > 0
    ? maintenance - avgDailyActual
    : plannedDailyBalanceKcal;

  const isLosing = weightGoal.targetWeight < weightGoal.currentWeight;
  const projectionWeeks = Math.max(1, weeksFromNow);

  // A balance running against the goal projects no change rather than a reversal
  const balanceMatchesGoal = isLosing ? dailyDeficitKcal > 0 : dailyDeficitKcal < 0;
  const projectedKg = balanceMatchesGoal
    ? (Math.abs(dailyDeficitKcal) * 7 * projectionWeeks) / 7700
    : 0;

  // Protein decides how much of that change is muscle rather than fat
  const protein = proteinAdherenceFromAverage(
    weeklyLogSummary.avgDailyProtein,
    daysWithData,
    nutritionGoal.dailyProtein
  );
  const proteinFactor = proteinQualityFactor(protein);

  // Calculate body composition projection
  let bodyFat: { initialBF: number; finalBF: number } | undefined;
  let muscleGain: MuscleGainProjection | undefined;
  const currentWeightKg = weightGoal.currentWeight / 2.205;

  if (userProfile) {
    const heightCm = parseHeightToCm(userProfile.height);
    const weightKg = currentWeightKg;
    if (heightCm && weightKg > 0) {
      if (isLosing) {
        bodyFat = calculateBodyFatProjection({
          weightKg,
          heightCm,
          ageyears: userProfile.age,
          gender: userProfile.gender,
          avgWorkoutsPerWeek: workoutStats?.avgWorkoutsPerWeek ?? 3,
          dailyDeficitKcal,
          weeksTotal: Math.max(1, projectionWeeks),
          proteinFactor,
        }) ?? undefined;
      } else if (liftingLevel) {
        muscleGain = calculateMuscleGainProjection({
          weightKg,
          heightCm,
          ageYears: userProfile.age,
          gender: userProfile.gender,
          liftingLevel,
          trainingYears,
          dailySurplusKcal: -dailyDeficitKcal,
          weeksTotal: Math.max(1, projectionWeeks),
          proteinFactor,
        }) ?? undefined;
      }
    }
  }

  try {
    const finalUrl = await generateWithGemini(referenceImages[0], projectedKg, isLosing, bodyFat, muscleGain, undefined, currentWeightKg, protein);

    return {
      imageUrl: finalUrl,
      predictionData: {
        isComplete: true,
        weeksFromNow,
        projectedWeightChange: projectedKg,
        dailyDeficitOrSurplus: 0,
        weeklyWorkoutHours: 0,
        confidenceLevel: hasLoggedWeek ? "Based on last week" : "Based on your plan",
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      imageUrl: "",
      predictionData: {
        isComplete: false,
        weeksFromNow,
        projectedWeightChange: 0,
        dailyDeficitOrSurplus: 0,
        weeklyWorkoutHours: 0,
        confidenceLevel: "Unavailable",
        message: msg || "Could not generate photo. Please try again.",
      },
    };
  }
}

export { generateFuturePhoto as buildFuturePhotoPrompt };
