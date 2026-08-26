/**
 * Turns the raw sign-up numbers — age, height, weight, gender, activity — into
 * a complete recommended plan, and judges any tweak the user makes to it.
 *
 * Two jobs live here:
 *   1. buildRecommendedPlan — what the app suggests the moment stats are known.
 *   2. evaluatePlan          — the hints, tips and warnings shown when the user
 *                              drags those numbers somewhere less realistic.
 *
 * Calories are the first lever, protein the second. Every advisory below is
 * written in that order of importance.
 */
import {
  OnboardingStats,
  OnboardingGoal,
  LiftingLevel,
  calculateTDEE,
  calculateBMR,
} from "../types/onboarding";

/** kcal stored in a kilogram of body mass — the standard planning constant. */
export const KCAL_PER_KG = 7700;

/**
 * Stamped on a saved plan so the startup macro migration knows the numbers were
 * produced by this engine and must not be recalculated over the top.
 */
export const CURRENT_MACROS_VERSION = "v3-stats-recommendations";

export type GoalType = "lose" | "gain" | "other";
export type PaceId = "gentle" | "moderate" | "aggressive" | "maintain";

export interface PaceOption {
  id: PaceId;
  label: string;
  tagline: string;
  /** Signed kg per week: negative loses weight, positive gains it. */
  weeklyChangeKg: number;
  targetCalories: number;
  /** Signed daily calories vs maintenance: negative is a deficit. */
  dailyDelta: number;
  compositionNote: string;
  accentColor: string;
  icon: string;
}

export interface RecommendedPlan {
  bmr: number;
  tdee: number;
  bmi: number;
  bmiLabel: string;
  goalType: GoalType;
  /** The three (or one) paces offered, always ordered gentle → aggressive. */
  paces: PaceOption[];
  /** Which pace the stats point to. Pre-selected for the user. */
  recommendedPaceId: PaceId;
  targetCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Signed kg/week of the recommended pace. */
  weeklyChangeKg: number;
  /** Plain-language reasons the recommendation landed where it did. */
  rationale: string[];
  /** Safe ceiling for weekly change, in kg — tweaks past this get flagged. */
  maxSafeWeeklyKg: number;
  /** Lowest daily calorie intake considered safe for this person. */
  calorieFloor: number;
}

// ─── Colors used by the advisory + pace UI ───────────────────────────────────

export const ADVISORY_COLORS = {
  good: "#15803d",
  info: "#0369a1",
  warn: "#b45309",
  danger: "#b91c1c",
} as const;

export type AdvisoryLevel = keyof typeof ADVISORY_COLORS;

export interface Advisory {
  id: string;
  level: AdvisoryLevel;
  title: string;
  detail: string;
  icon: string;
}

// ─── Body composition helpers ────────────────────────────────────────────────

export function calculateBMI(weightKg: number, heightCm: number): number {
  if (heightCm <= 0) return 0;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bmiLabel(bmi: number): string {
  if (bmi <= 0) return "—";
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Healthy range";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

/**
 * A person carrying more fat can safely lose faster; a lean person cannot.
 * Rate is expressed as a share of body weight per week, then converted to kg.
 */
function maxSafeLossPerWeekKg(weightKg: number, bmi: number, age: number): number {
  let pct = 0.0075; // 0.75% of body weight per week — the usual safe ceiling
  if (bmi >= 30) pct = 0.011;
  else if (bmi >= 27) pct = 0.0095;
  else if (bmi < 22) pct = 0.005;
  if (age >= 55) pct = Math.min(pct, 0.006); // protect lean mass with age
  return Math.max(0.2, weightKg * pct);
}

/**
 * Muscle is built slowly and the ceiling drops hard with training age. These
 * are monthly rates as a share of body weight, converted to kg per week.
 */
function maxSafeGainPerWeekKg(
  weightKg: number,
  bmi: number,
  level: LiftingLevel | undefined
): number {
  const monthlyPct: Record<LiftingLevel, number> = {
    beginner: 0.015,
    intermediate: 0.01,
    advanced: 0.005,
  };
  const pct = monthlyPct[level ?? "beginner"];
  let perWeek = (weightKg * pct) / 4.345;
  if (bmi >= 28) perWeek *= 0.6; // already carrying fat — bulk slower
  return Math.max(0.1, perWeek);
}

/**
 * The fastest weekly change this body can make without the extra becoming
 * muscle loss (cutting) or fat gain (bulking). Exposed so a target weight typed
 * in before the plan exists can still be judged against real limits.
 */
export function maxSafeWeeklyChangeKg(
  stats: OnboardingStats,
  goalType: GoalType,
  liftingLevel?: LiftingLevel
): number {
  const bmi = calculateBMI(stats.weightKg, stats.heightCm);
  if (goalType === "lose") return maxSafeLossPerWeekKg(stats.weightKg, bmi, stats.age);
  if (goalType === "gain") return maxSafeGainPerWeekKg(stats.weightKg, bmi, liftingLevel);
  return 0;
}

/**
 * The lowest intake the app will ever put in front of the user. Sitting a
 * little under resting burn is survivable while there is fat to spend; well
 * under it is not, so the floor never drops past 90% of BMR.
 */
export function calorieFloorFor(stats: OnboardingStats): number {
  const bmr = calculateBMR(stats.weightKg, stats.heightCm, stats.age, stats.gender);
  const sexFloor = stats.gender === "male" ? 1500 : 1200;
  return Math.max(sexFloor, Math.round(bmr * 0.9));
}

// ─── Macros ──────────────────────────────────────────────────────────────────

/** Protein target in g/kg, before any user tweak. Higher when cutting. */
export function recommendedProteinPerKg(goalType: GoalType, bmi: number, age: number): number {
  let perKg = goalType === "lose" ? 2.2 : goalType === "gain" ? 2.0 : 1.8;
  // Protein scales with lean mass, not total mass — dial it back at high BMI
  if (bmi >= 30) perKg -= 0.4;
  else if (bmi >= 27) perKg -= 0.2;
  if (age >= 60) perKg += 0.1; // older adults need more to hold muscle
  return Math.round(perKg * 10) / 10;
}

/**
 * Splits a calorie target around a fixed protein number. Fat is held at a
 * hormone-safe floor first, carbs take whatever is left.
 */
export function macrosFromCaloriesAndProtein(
  targetCalories: number,
  proteinG: number,
  weightKg: number
): { protein: number; carbs: number; fat: number } {
  const protein = Math.max(0, Math.round(proteinG));
  const afterProtein = Math.max(0, targetCalories - protein * 4);

  const fatFloorG = Math.round(weightKg * 0.6);
  let fat = Math.round((afterProtein * 0.3) / 9);
  if (fat < fatFloorG) fat = Math.min(fatFloorG, Math.round(afterProtein / 9));

  const carbs = Math.max(0, Math.round((afterProtein - fat * 9) / 4));
  return { protein, carbs, fat };
}

// ─── The recommendation ──────────────────────────────────────────────────────

function paceColor(level: "gentle" | "moderate" | "aggressive"): string {
  return level === "gentle" ? "#15803d" : level === "moderate" ? "#0f766e" : "#b45309";
}

/**
 * Builds the full plan the app suggests from the stats alone. The goal (and its
 * program length + target weight) nudges which pace is recommended, but every
 * pace stays inside what the body can actually do.
 */
export function buildRecommendedPlan(
  stats: OnboardingStats,
  goal: OnboardingGoal | null
): RecommendedPlan {
  const goalType: GoalType = goal?.type ?? "other";
  const bmr = calculateBMR(stats.weightKg, stats.heightCm, stats.age, stats.gender);
  const tdee = calculateTDEE(stats.weightKg, stats.heightCm, stats.age, stats.gender, stats.lifestyle);
  const bmi = calculateBMI(stats.weightKg, stats.heightCm);
  const label = bmiLabel(bmi);
  const floor = calorieFloorFor(stats);
  const rationale: string[] = [];

  /**
   * Builds a pace from a desired weekly rate. The calorie target is clamped to
   * the safe floor first and the rate is then read back off the clamped
   * calories, so what the card promises is always what the numbers deliver.
   */
  const makePace = (
    id: PaceId,
    label: string,
    tagline: string,
    desiredWeeklyKg: number,
    compositionNote: string,
    tone: "gentle" | "moderate" | "aggressive",
    icon: string
  ): PaceOption => {
    const targetCalories = Math.max(floor, Math.round(tdee + (desiredWeeklyKg * KCAL_PER_KG) / 7));
    const dailyDelta = targetCalories - tdee;
    return {
      id,
      label,
      tagline,
      weeklyChangeKg: (dailyDelta * 7) / KCAL_PER_KG,
      targetCalories,
      dailyDelta,
      compositionNote,
      accentColor: paceColor(tone),
      icon,
    };
  };

  let paces: PaceOption[] = [];
  let maxSafeWeeklyKg = 0;
  let recommendedPaceId: PaceId = "moderate";

  if (goalType === "lose") {
    maxSafeWeeklyKg = maxSafeLossPerWeekKg(stats.weightKg, bmi, stats.age);
    paces = [
      makePace("gentle", "Gentle", "Slow and steady", -maxSafeWeeklyKg * 0.45,
        "Muscle loss: near zero", "gentle", "leaf-outline"),
      makePace("moderate", "Steady", "Balanced", -maxSafeWeeklyKg * 0.7,
        "Muscle loss: minimal with enough protein", "moderate", "trending-down-outline"),
      makePace("aggressive", "Aggressive", "Fastest safe pace", -maxSafeWeeklyKg,
        "Muscle loss: real — protein is non-negotiable", "aggressive", "flash-outline"),
    ];

    recommendedPaceId = bmi >= 27 ? "aggressive" : bmi < 22 ? "gentle" : "moderate";
    rationale.push(
      `At ${stats.weightKg} kg and ${Math.round(bmi * 10) / 10} BMI (${label.toLowerCase()}), your body can lose up to ${maxSafeWeeklyKg.toFixed(2)} kg a week without eating into muscle.`
    );
  } else if (goalType === "gain") {
    maxSafeWeeklyKg = maxSafeGainPerWeekKg(stats.weightKg, bmi, goal?.liftingLevel);
    paces = [
      makePace("gentle", "Lean Bulk", "Almost no fat gain", maxSafeWeeklyKg * 0.5,
        "Fat gain: near zero", "gentle", "leaf-outline"),
      makePace("moderate", "Steady", "Balanced", maxSafeWeeklyKg * 0.75,
        "Fat gain: small and easy to strip later", "moderate", "trending-up-outline"),
      makePace("aggressive", "Aggressive", "Max muscle rate", maxSafeWeeklyKg,
        "Fat gain: noticeable", "aggressive", "flash-outline"),
    ];

    recommendedPaceId = bmi >= 28 ? "gentle" : goal?.liftingLevel === "beginner" ? "moderate" : "gentle";
    const levelWord = goal?.liftingLevel ?? "beginner";
    rationale.push(
      `As a ${levelWord} lifter at ${stats.weightKg} kg, roughly ${maxSafeWeeklyKg.toFixed(2)} kg a week is the most you can add before the extra becomes fat rather than muscle.`
    );
  } else {
    maxSafeWeeklyKg = 0;
    paces = [
      makePace("maintain", "Maintain", "Hold your weight", 0,
        "Body composition: stable, and improving with training", "moderate", "remove-outline"),
    ];
    recommendedPaceId = "maintain";
    rationale.push(
      `Eating at your maintenance of ${tdee.toLocaleString()} cal keeps your weight steady while training reshapes what is underneath.`
    );
  }

  // Nudge the pace toward whatever the sealed program length actually requires
  if (goal && goalType !== "other" && goal.weeksToGoal > 0) {
    const needKg = goal.targetWeightKg - stats.weightKg;
    const neededWeekly = needKg / goal.weeksToGoal;
    if (Math.abs(neededWeekly) > 0.01) {
      const closest = paces.reduce((best, p) =>
        Math.abs(p.weeklyChangeKg - neededWeekly) < Math.abs(best.weeklyChangeKg - neededWeekly) ? p : best
      );
      const withinSafety = Math.abs(neededWeekly) <= maxSafeWeeklyKg * 1.05;
      if (withinSafety) {
        recommendedPaceId = closest.id;
        rationale.push(
          `Your ${goal.weeksToGoal}-week program and ${goal.targetWeightKg} kg target work out to ${Math.abs(neededWeekly).toFixed(2)} kg a week, so we picked the pace closest to that.`
        );
      } else {
        recommendedPaceId = "aggressive";
        rationale.push(
          `Reaching ${goal.targetWeightKg} kg in ${goal.weeksToGoal} weeks would need ${Math.abs(neededWeekly).toFixed(2)} kg a week — faster than is healthy. We set the fastest safe pace instead.`
        );
      }
    }
  }

  // A low calorie floor can squash two paces onto the same number — show one.
  const chosenCalories = (paces.find((p) => p.id === recommendedPaceId) ?? paces[0]).targetCalories;
  const seenCalories = new Set<number>();
  paces = paces.filter((p) => {
    if (seenCalories.has(p.targetCalories)) return false;
    seenCalories.add(p.targetCalories);
    return true;
  });

  const chosen =
    paces.find((p) => p.targetCalories === chosenCalories) ??
    paces.find((p) => p.id === recommendedPaceId) ??
    paces[0];
  recommendedPaceId = chosen.id;

  const perKg = recommendedProteinPerKg(goalType, bmi, stats.age);
  const proteinTarget = Math.round(stats.weightKg * perKg);
  const macros = macrosFromCaloriesAndProtein(chosen.targetCalories, proteinTarget, stats.weightKg);

  rationale.push(
    `Protein is set at ${perKg} g per kg of body weight — the amount that decides how much of your ${goalType === "gain" ? "gain is muscle" : "loss is fat"}.`
  );

  return {
    bmr,
    tdee,
    bmi,
    bmiLabel: label,
    goalType,
    paces,
    recommendedPaceId: chosen.id,
    targetCalories: chosen.targetCalories,
    proteinG: macros.protein,
    carbsG: macros.carbs,
    fatG: macros.fat,
    weeklyChangeKg: chosen.weeklyChangeKg,
    rationale,
    maxSafeWeeklyKg,
    calorieFloor: floor,
  };
}

// ─── Judging a tweak ─────────────────────────────────────────────────────────

export interface PlanEdit {
  targetCalories: number;
  proteinG: number;
}

export interface PlanEvaluation {
  advisories: Advisory[];
  /** Signed kg/week implied by the edited calories. */
  projectedWeeklyKg: number;
  /** Weight at the end of the program if the edited plan is followed. */
  projectedEndWeightKg: number;
  /** Weeks needed to reach the target weight, or null when it never gets there. */
  weeksToTarget: number | null;
  /** True when the edited plan reaches the target weight inside the program. */
  reachesTargetInProgram: boolean;
  /** True when nothing worse than an "info" hint was raised. */
  isSensible: boolean;
}

/**
 * Everything the tweak UI needs: what the edited numbers will actually do, and
 * every hint, tip or warning the change deserves.
 */
export function evaluatePlan(
  edit: PlanEdit,
  stats: OnboardingStats,
  goal: OnboardingGoal | null,
  plan: RecommendedPlan
): PlanEvaluation {
  const advisories: Advisory[] = [];
  const goalType = plan.goalType;
  const dailyDelta = edit.targetCalories - plan.tdee;
  const projectedWeeklyKg = (dailyDelta * 7) / KCAL_PER_KG;
  const weeks = goal?.weeksToGoal ?? 12;
  const projectedEndWeightKg =
    Math.round((stats.weightKg + projectedWeeklyKg * weeks) * 10) / 10;

  const needKg = goal && goalType !== "other" ? goal.targetWeightKg - stats.weightKg : 0;
  let weeksToTarget: number | null = null;
  if (needKg !== 0 && Math.abs(projectedWeeklyKg) > 0.005 && Math.sign(needKg) === Math.sign(projectedWeeklyKg)) {
    weeksToTarget = Math.ceil(Math.abs(needKg) / Math.abs(projectedWeeklyKg));
  }
  const reachesTargetInProgram = weeksToTarget !== null && weeksToTarget <= weeks;

  // ── Calories: the first lever ──────────────────────────────────────────────
  if (edit.targetCalories < plan.calorieFloor) {
    advisories.push({
      id: "below-floor",
      level: "danger",
      title: "Too low to be safe",
      detail: `Your body burns ${plan.bmr.toLocaleString()} cal a day at complete rest. Under ${plan.calorieFloor.toLocaleString()} cal you cannot cover your protein and micronutrients, your energy craters and your body starts breaking down muscle. Bring this back up.`,
      icon: "alert-circle",
    });
  } else if (edit.targetCalories < plan.bmr) {
    advisories.push({
      id: "under-resting-burn",
      level: "info",
      title: "Sitting just under your resting burn",
      detail: `${edit.targetCalories.toLocaleString()} cal is below the ${plan.bmr.toLocaleString()} cal you burn at rest. That is workable for a hard push while you have fat to spend, but it is the lowest we will plan for — and protein matters more here than anywhere else.`,
      icon: "information-circle",
    });
  }

  const deficitPct = plan.tdee > 0 ? Math.abs(dailyDelta) / plan.tdee : 0;
  // Float slack so a pace sitting exactly on the safe ceiling never warns
  const RATE_SLACK = 0.02;

  if (goalType === "lose") {
    if (dailyDelta >= 0) {
      advisories.push({
        id: "no-deficit",
        level: "warn",
        title: "No deficit at all",
        detail: `You picked fat loss, but ${edit.targetCalories.toLocaleString()} cal is at or above your ${plan.tdee.toLocaleString()} cal maintenance. At this intake your weight will not move.`,
        icon: "warning",
      });
    } else if (Math.abs(projectedWeeklyKg) > plan.maxSafeWeeklyKg + RATE_SLACK) {
      advisories.push({
        id: "too-fast-loss",
        level: "warn",
        title: `Faster than ${plan.maxSafeWeeklyKg.toFixed(2)} kg a week`,
        detail: `This pace drops ${Math.abs(projectedWeeklyKg).toFixed(2)} kg a week. Past your safe ceiling the extra loss comes off your muscle, and hunger makes the plan much harder to stick to.`,
        icon: "warning",
      });
    } else if (deficitPct > 0 && deficitPct < 0.08) {
      advisories.push({
        id: "tiny-deficit",
        level: "info",
        title: "Very gentle deficit",
        detail: `At ${Math.abs(projectedWeeklyKg).toFixed(2)} kg a week this is comfortable, but day-to-day water weight will hide your progress. Expect the scale to look flat for a week or two at a time.`,
        icon: "information-circle",
      });
    }
  }

  if (goalType === "gain") {
    if (dailyDelta <= 0) {
      advisories.push({
        id: "no-surplus",
        level: "warn",
        title: "No surplus at all",
        detail: `Building muscle needs more energy than you burn. At ${edit.targetCalories.toLocaleString()} cal against a ${plan.tdee.toLocaleString()} cal maintenance there is nothing spare to build with.`,
        icon: "warning",
      });
    } else if (projectedWeeklyKg > plan.maxSafeWeeklyKg + RATE_SLACK) {
      advisories.push({
        id: "too-fast-gain",
        level: "warn",
        title: "More than you can build",
        detail: `Muscle grows at roughly ${plan.maxSafeWeeklyKg.toFixed(2)} kg a week for you. Adding ${projectedWeeklyKg.toFixed(2)} kg a week means the difference lands as fat, not muscle.`,
        icon: "warning",
      });
    }
  }

  if (goalType === "other" && Math.abs(dailyDelta) > 250) {
    advisories.push({
      id: "not-maintenance",
      level: "info",
      title: "This is not maintenance",
      detail: `You chose health and performance, but ${edit.targetCalories.toLocaleString()} cal will move your weight by about ${Math.abs(projectedWeeklyKg).toFixed(2)} kg a week.`,
      icon: "information-circle",
    });
  }

  // ── Does the edit still land the goal on time? ─────────────────────────────
  if (goal && goalType !== "other" && needKg !== 0) {
    if (weeksToTarget === null) {
      advisories.push({
        id: "wrong-direction",
        level: "warn",
        title: "Moving away from your target",
        detail: `Your target is ${goal.targetWeightKg} kg. At this intake you end the ${weeks} weeks near ${projectedEndWeightKg} kg instead.`,
        icon: "warning",
      });
    } else if (!reachesTargetInProgram) {
      const over = weeksToTarget - weeks;
      const barelyMoves = weeksToTarget > weeks * 3;
      // At the floor there is no room left to cut — the answer is movement,
      // not fewer calories, and the advice has to say so.
      const atFloor = edit.targetCalories <= plan.calorieFloor + 25;
      let detail: string;
      if (barelyMoves && atFloor) {
        detail = `Your maintenance is only ${plan.tdee.toLocaleString()} cal, so there is no room to cut further without going under what your body needs. The deficit has to come from moving more — steps and training — rather than eating less. Expect to finish nearer ${projectedEndWeightKg} kg than ${goal.targetWeightKg} kg.`;
      } else if (barelyMoves) {
        detail = `Your goal date is sealed at ${weeks} weeks, but this pace barely moves the scale — you would finish around ${projectedEndWeightKg} kg instead of ${goal.targetWeightKg} kg. Pick a real ${goalType === "gain" ? "surplus" : "deficit"}.`;
      } else {
        detail = `Your goal date is sealed at ${weeks} weeks. This pace needs ${weeksToTarget} weeks to reach ${goal.targetWeightKg} kg — you would finish around ${projectedEndWeightKg} kg. Either accept that or push the pace up a notch.`;
      }
      advisories.push({
        id: "misses-goal-date",
        level: barelyMoves && !atFloor ? "warn" : "info",
        title: barelyMoves
          ? atFloor
            ? "Your target needs movement, not fewer calories"
            : "Nowhere near your goal date"
          : `About ${over} week${over === 1 ? "" : "s"} short`,
        icon: atFloor ? "walk-outline" : "calendar-outline",
        detail,
      });
    } else {
      advisories.push({
        id: "on-track",
        level: "good",
        title: "Lands your goal in time",
        detail: `At this pace you hit ${goal.targetWeightKg} kg in about ${weeksToTarget} of your ${weeks} weeks.`,
        icon: "checkmark-circle",
      });
    }
  }

  // ── Protein: the second lever ──────────────────────────────────────────────
  const perKg = stats.weightKg > 0 ? edit.proteinG / stats.weightKg : 0;
  const recommendedPerKg = recommendedProteinPerKg(goalType, plan.bmi, stats.age);

  if (perKg < 1.2) {
    advisories.push({
      id: "protein-critical",
      level: "danger",
      title: `Protein far too low (${perKg.toFixed(1)} g/kg)`,
      detail:
        goalType === "gain"
          ? "Below 1.2 g/kg you will gain weight without the muscle to show for it. Your surplus turns into fat."
          : "Below 1.2 g/kg a serious share of what you lose will be muscle, not fat. You get smaller, not leaner.",
      icon: "alert-circle",
    });
  } else if (perKg < recommendedPerKg - 0.35) {
    advisories.push({
      id: "protein-low",
      level: "warn",
      title: `Protein under target (${perKg.toFixed(1)} g/kg)`,
      detail: `We recommend ${recommendedPerKg} g/kg — ${Math.round(stats.weightKg * recommendedPerKg)} g a day for you. Protein is the difference between losing fat and losing muscle, so it is the last thing to cut.`,
      icon: "warning",
    });
  } else if (perKg > 3.2) {
    advisories.push({
      id: "protein-excess",
      level: "info",
      title: `Protein higher than needed (${perKg.toFixed(1)} g/kg)`,
      detail: "There is no extra muscle above roughly 2.5 g/kg, and this much crowds out the carbs that fuel your training. Not harmful, just not useful.",
      icon: "information-circle",
    });
  }

  // ── Macro sanity, given the calories and protein chosen ────────────────────
  const macros = macrosFromCaloriesAndProtein(edit.targetCalories, edit.proteinG, stats.weightKg);
  if (edit.proteinG * 4 > edit.targetCalories * 0.6) {
    advisories.push({
      id: "protein-crowding",
      level: "warn",
      title: "Protein eats most of your calories",
      detail: `${edit.proteinG} g of protein is ${Math.round((edit.proteinG * 4 * 100) / Math.max(1, edit.targetCalories))}% of a ${edit.targetCalories.toLocaleString()} cal day, leaving almost nothing for fat and carbs. Raise calories or lower protein.`,
      icon: "warning",
    });
  } else if (macros.fat < stats.weightKg * 0.5) {
    advisories.push({
      id: "fat-low",
      level: "warn",
      title: "Fat is below the hormone floor",
      detail: `These numbers leave only ${macros.fat} g of fat. Under about ${Math.round(stats.weightKg * 0.6)} g your hormones, mood and recovery start to suffer.`,
      icon: "warning",
    });
  }

  const isSensible = !advisories.some((a) => a.level === "warn" || a.level === "danger");

  return {
    advisories,
    projectedWeeklyKg,
    projectedEndWeightKg,
    weeksToTarget,
    reachesTargetInProgram,
    isSensible,
  };
}
