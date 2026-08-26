/**
 * Protein is the app's second lever, right after the calorie deficit or
 * surplus. Calories decide how much weight moves; protein decides how much of
 * that movement is muscle instead of fat — cutting or bulking.
 *
 * Everything that scores, projects or displays protein reads from here so the
 * whole app agrees on what "hitting your protein" means.
 */
import { Meal } from "../types/diet";

/** A day counts as a protein hit at 90% of target or above. */
export const PROTEIN_HIT_RATIO = 0.9;

/** Below this share of target, protein is actively costing you results. */
export const PROTEIN_LOW_RATIO = 0.7;

export interface ProteinAdherence {
  /** Daily protein target in grams */
  targetG: number;
  /** Average grams per logged day over the window */
  avgDailyG: number;
  /** Days in the window with at least one logged meal */
  daysLogged: number;
  /** Logged days that reached PROTEIN_HIT_RATIO of target */
  daysHit: number;
  /** avgDailyG ÷ target, capped at 1 — how well protein was covered */
  ratio: number;
  /** Share of logged days that hit target, 0–100 */
  hitRatePct: number;
  /** False when there is not enough logged data to judge (< 3 days) */
  hasData: boolean;
}

/** Protein adherence over the trailing `days` days of logged meals. */
export function calculateProteinAdherence(
  meals: Meal[],
  dailyProteinTarget: number,
  days = 7
): ProteinAdherence {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const proteinByDay = new Map<string, number>();

  meals
    .filter((m) => m.timestamp >= since)
    .forEach((m) => {
      const key = new Date(m.timestamp).toDateString();
      proteinByDay.set(key, (proteinByDay.get(key) ?? 0) + m.protein);
    });

  const daysLogged = proteinByDay.size;
  const target = dailyProteinTarget > 0 ? dailyProteinTarget : 0;

  let total = 0;
  let daysHit = 0;
  proteinByDay.forEach((g) => {
    total += g;
    if (target > 0 && g >= target * PROTEIN_HIT_RATIO) daysHit++;
  });

  const avgDailyG = daysLogged > 0 ? total / daysLogged : 0;

  return {
    targetG: target,
    avgDailyG,
    daysLogged,
    daysHit,
    ratio: target > 0 ? Math.min(1, avgDailyG / target) : 0,
    hitRatePct: daysLogged > 0 ? (daysHit / daysLogged) * 100 : 0,
    hasData: daysLogged >= 3 && target > 0,
  };
}

/**
 * Same shape, built from a pre-aggregated weekly summary rather than raw meals.
 * Day-by-day hits are unknown here, so the hit rate is approximated from how
 * close the average day came to target.
 */
export function proteinAdherenceFromAverage(
  avgDailyG: number,
  daysLogged: number,
  dailyProteinTarget: number
): ProteinAdherence {
  const target = dailyProteinTarget > 0 ? dailyProteinTarget : 0;
  const ratio = target > 0 ? Math.min(1, avgDailyG / target) : 0;
  const hit = target > 0 && avgDailyG >= target * PROTEIN_HIT_RATIO;

  return {
    targetG: target,
    avgDailyG,
    daysLogged,
    daysHit: hit ? daysLogged : 0,
    ratio,
    hitRatePct: hit ? 100 : ratio * 100,
    hasData: daysLogged >= 3 && target > 0,
  };
}

/**
 * How much of the muscle you could theoretically build — or hold on to while
 * cutting — your protein intake actually supports.
 *
 * Full protein returns 1. Missing it drags the multiplier down to a floor of
 * 0.5: the calories still land, but far less of the result is muscle. Without
 * enough logged data we assume the plan is being followed and return 1.
 */
export function proteinQualityFactor(adherence: ProteinAdherence): number {
  if (!adherence.hasData) return 1;
  return Math.min(1, Math.max(0.5, 0.5 + 0.5 * adherence.ratio));
}

export type ProteinStatus = "on-track" | "behind" | "low" | "no-data";

export function proteinStatus(adherence: ProteinAdherence): ProteinStatus {
  if (!adherence.hasData) return "no-data";
  if (adherence.ratio >= PROTEIN_HIT_RATIO) return "on-track";
  if (adherence.ratio >= PROTEIN_LOW_RATIO) return "behind";
  return "low";
}

/** Short line explaining what last week's protein is doing to the result. */
export function proteinImpactMessage(
  adherence: ProteinAdherence,
  isLosing: boolean
): string {
  switch (proteinStatus(adherence)) {
    case "no-data":
      return "Log a few more days to see what your protein is doing to your result.";
    case "on-track":
      return isLosing
        ? "Protein is on point — the weight you lose is coming off as fat, not muscle."
        : "Protein is on point — your surplus is being built into muscle.";
    case "behind":
      return isLosing
        ? "Protein is slipping. Some of what you lose will be muscle, not fat."
        : "Protein is slipping. Part of your surplus is going to fat instead of muscle.";
    case "low":
      return isLosing
        ? "Protein is too low. At this intake a real share of your loss is muscle."
        : "Protein is too low. You are gaining weight without the muscle to show for it.";
  }
}
