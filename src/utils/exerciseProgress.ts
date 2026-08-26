// exerciseProgress.ts — turns logged workout sessions into per-exercise trends.
// Each exercise gets one primary metric so that comparisons across sessions are
// always apples-to-apples, and every metric is oriented so higher = better.

import { LoggedExercise, WorkoutEntry, WorkoutSession } from "../types/diet";
import { getExerciseDef } from "../data/exerciseLibrary";
import { getActivity } from "../data/exerciseActivities";

export const LB_PER_KG = 2.20462;
export const MI_PER_KM = 0.621371;

export type ProgressMetricKind = "est1rm" | "reps" | "duration" | "speed" | "distance";

export interface ExercisePoint {
  sessionId: string;
  timestamp: number;
  /** Primary metric, already converted to the user's display unit */
  value: number;
  /** Secondary "work done" figure in display units (volume, minutes, distance) */
  volume: number;
  detail: string;
}

export interface ExerciseTrend {
  exerciseKey: string;
  name: string;
  icon: string;
  metricKind: ProgressMetricKind;
  metricLabel: string;
  unit: string;
  volumeLabel: string;
  volumeUnit: string;
  points: ExercisePoint[];
  latest: ExercisePoint;
  previous: ExercisePoint | null;
  first: ExercisePoint;
  best: ExercisePoint;
  /** % change against the previous time this exercise was logged */
  changePct: number | null;
  /** % change against the first time it was logged */
  totalChangePct: number | null;
  sessionCount: number;
  lastLogged: number;
}

const round = (n: number, dp = 1) => {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
};

/** Epley formula — a weight/rep independent way to compare strength sessions */
export const estimatedOneRepMax = (weight: number, reps: number) =>
  reps <= 1 ? weight : weight * (1 + reps / 30);

const hasSetData = (ex: LoggedExercise) =>
  ex.sets.some((s) => (s.reps ?? 0) > 0 || (s.weight ?? 0) > 0);

/** True when the entry carries enough information to chart */
export function exerciseHasData(ex: LoggedExercise): boolean {
  switch (ex.metric) {
    case "weight_reps":
    case "reps":
      return hasSetData(ex);
    case "duration":
      return (ex.durationMinutes ?? 0) > 0;
    case "distance_duration":
      return (ex.durationMinutes ?? 0) > 0 || (ex.distance ?? 0) > 0;
  }
}

function decideMetricKind(entries: LoggedExercise[]): ProgressMetricKind {
  const metric = entries[0].metric;
  if (metric === "weight_reps") {
    const anyWeight = entries.some((e) => e.sets.some((s) => (s.weight ?? 0) > 0));
    return anyWeight ? "est1rm" : "reps";
  }
  if (metric === "reps") return "reps";
  if (metric === "duration") return "duration";
  // distance_duration — prefer speed, fall back to distance, then time
  const everyPace = entries.some((e) => (e.distance ?? 0) > 0 && (e.durationMinutes ?? 0) > 0);
  if (everyPace) return "speed";
  const anyDistance = entries.some((e) => (e.distance ?? 0) > 0);
  return anyDistance ? "distance" : "duration";
}

interface UnitContext {
  isMetric: boolean;
}

function pointFor(
  ex: LoggedExercise,
  session: WorkoutSession,
  kind: ProgressMetricKind,
  { isMetric }: UnitContext
): ExercisePoint | null {
  const toWeight = (lb: number) => round(isMetric ? lb / LB_PER_KG : lb, 1);
  const toDistance = (mi: number) => round(isMetric ? mi / MI_PER_KM : mi, 2);
  const wUnit = isMetric ? "kg" : "lb";
  const dUnit = isMetric ? "km" : "mi";

  const base = { sessionId: session.id, timestamp: session.timestamp };

  if (kind === "est1rm") {
    const workingSets = ex.sets.filter((s) => (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0);
    if (workingSets.length === 0) return null;
    let bestSet = workingSets[0];
    let bestOrm = estimatedOneRepMax(bestSet.weight ?? 0, bestSet.reps ?? 0);
    for (const s of workingSets) {
      const orm = estimatedOneRepMax(s.weight ?? 0, s.reps ?? 0);
      if (orm > bestOrm) {
        bestOrm = orm;
        bestSet = s;
      }
    }
    const volume = workingSets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
    return {
      ...base,
      value: toWeight(bestOrm),
      volume: Math.round(toWeight(volume)),
      detail: `${toWeight(bestSet.weight ?? 0)} ${wUnit} × ${bestSet.reps} · ${workingSets.length} sets`,
    };
  }

  if (kind === "reps") {
    const repSets = ex.sets.filter((s) => (s.reps ?? 0) > 0);
    if (repSets.length === 0) return null;
    const bestReps = Math.max(...repSets.map((s) => s.reps ?? 0));
    const totalReps = repSets.reduce((sum, s) => sum + (s.reps ?? 0), 0);
    return {
      ...base,
      value: bestReps,
      volume: totalReps,
      detail: `${bestReps} reps best · ${totalReps} total`,
    };
  }

  if (kind === "duration") {
    const mins = ex.durationMinutes ?? 0;
    if (mins <= 0) return null;
    return { ...base, value: mins, volume: mins, detail: `${mins} min` };
  }

  if (kind === "distance") {
    const dist = ex.distance ?? 0;
    if (dist <= 0) return null;
    const d = toDistance(dist);
    return { ...base, value: d, volume: d, detail: `${d} ${dUnit}` };
  }

  // speed
  const dist = ex.distance ?? 0;
  const mins = ex.durationMinutes ?? 0;
  if (dist <= 0 || mins <= 0) return null;
  const d = toDistance(dist);
  const speed = round(d / (mins / 60), 2);
  const paceMin = mins / d;
  const paceLabel = `${Math.floor(paceMin)}:${String(Math.round((paceMin % 1) * 60)).padStart(2, "0")}`;
  return {
    ...base,
    value: speed,
    volume: d,
    detail: `${d} ${dUnit} in ${mins} min · ${paceLabel}/${isMetric ? "km" : "mi"}`,
  };
}

const METRIC_META: Record<ProgressMetricKind, { label: string; volumeLabel: string }> = {
  est1rm: { label: "Est. 1RM", volumeLabel: "Volume" },
  reps: { label: "Best set", volumeLabel: "Total reps" },
  duration: { label: "Duration", volumeLabel: "Minutes" },
  speed: { label: "Avg speed", volumeLabel: "Distance" },
  distance: { label: "Distance", volumeLabel: "Distance" },
};

function unitsFor(kind: ProgressMetricKind, isMetric: boolean) {
  switch (kind) {
    case "est1rm":
      return { unit: isMetric ? "kg" : "lb", volumeUnit: isMetric ? "kg" : "lb" };
    case "reps":
      return { unit: "reps", volumeUnit: "reps" };
    case "duration":
      return { unit: "min", volumeUnit: "min" };
    case "speed":
      return { unit: isMetric ? "km/h" : "mph", volumeUnit: isMetric ? "km" : "mi" };
    case "distance":
      return { unit: isMetric ? "km" : "mi", volumeUnit: isMetric ? "km" : "mi" };
  }
}

/**
 * Build one trend per exercise that appears in the given sessions, newest
 * activity first. Exercises logged only once still return a trend (with a null
 * change) so the UI can prompt for a second data point.
 */
export function buildExerciseTrends(
  sessions: WorkoutSession[],
  isMetric: boolean
): ExerciseTrend[] {
  const grouped = new Map<string, { session: WorkoutSession; ex: LoggedExercise }[]>();

  const ordered = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
  for (const session of ordered) {
    for (const ex of session.exercises) {
      if (!exerciseHasData(ex)) continue;
      const list = grouped.get(ex.exerciseKey) ?? [];
      list.push({ session, ex });
      grouped.set(ex.exerciseKey, list);
    }
  }

  const trends: ExerciseTrend[] = [];
  for (const [exerciseKey, entries] of grouped) {
    const kind = decideMetricKind(entries.map((e) => e.ex));
    const points = entries
      .map(({ ex, session }) => pointFor(ex, session, kind, { isMetric }))
      .filter((p): p is ExercisePoint => p !== null);
    if (points.length === 0) continue;

    const latest = points[points.length - 1];
    const previous = points.length > 1 ? points[points.length - 2] : null;
    const first = points[0];
    const best = points.reduce((a, b) => (b.value > a.value ? b : a), points[0]);
    const def = getExerciseDef(exerciseKey);
    const { unit, volumeUnit } = unitsFor(kind, isMetric);

    trends.push({
      exerciseKey,
      name: entries[entries.length - 1].ex.name,
      icon: def?.icon ?? "ellipse-outline",
      metricKind: kind,
      metricLabel: METRIC_META[kind].label,
      unit,
      volumeLabel: METRIC_META[kind].volumeLabel,
      volumeUnit,
      points,
      latest,
      previous,
      first,
      best,
      changePct:
        previous && previous.value > 0
          ? round(((latest.value - previous.value) / previous.value) * 100, 1)
          : null,
      totalChangePct:
        points.length > 1 && first.value > 0
          ? round(((latest.value - first.value) / first.value) * 100, 1)
          : null,
      sessionCount: points.length,
      lastLogged: latest.timestamp,
    });
  }

  return trends.sort((a, b) => b.lastLogged - a.lastLogged);
}

/** Total tonnage (display units) lifted across the given sessions */
export function sessionVolume(session: WorkoutSession, isMetric: boolean): number {
  const lb = session.exercises.reduce(
    (sum, ex) =>
      sum +
      ex.sets.reduce((s, set) => s + (set.weight ?? 0) * (set.reps ?? 0), 0),
    0
  );
  return Math.round(isMetric ? lb / LB_PER_KG : lb);
}

/** Rough minutes for a session — explicit durations plus 3 min per logged set */
export function sessionMinutes(session: WorkoutSession): number {
  let mins = 0;
  let sets = 0;
  for (const ex of session.exercises) {
    mins += ex.durationMinutes ?? 0;
    sets += ex.sets.filter((s) => (s.reps ?? 0) > 0 || (s.weight ?? 0) > 0).length;
  }
  return Math.max(1, Math.round(mins + sets * 3));
}

/**
 * Sessions are mirrored into the flat `workouts` list so streaks, weekly stats
 * and the calorie-burn adjustment keep counting them.
 */
export function workoutEntryFromSession(
  session: WorkoutSession
): Omit<WorkoutEntry, "id" | "timestamp"> {
  const primary = session.exercises[0];
  const def = primary ? getExerciseDef(primary.exerciseKey) : undefined;
  const activity = def ? getActivity(def.activityKey) : undefined;
  const mixed = session.exercises.length > 1;

  return {
    type: mixed ? "mixed" : activity?.mapToType ?? "strength",
    activityKey: mixed ? undefined : activity?.key,
    durationMinutes: sessionMinutes(session),
    intensity: activity?.defaultIntensity ?? "medium",
    description: session.title?.trim() || summarizeSession(session),
    sessionId: session.id,
  };
}

export function summarizeSession(session: WorkoutSession): string {
  const names = session.exercises.map((e) => e.name);
  if (names.length === 0) return "No exercises";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}
