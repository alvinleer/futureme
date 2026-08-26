// workout-speech-parser.ts — turns dictated gym talk ("bench press three sets of
// eight at 185, then lat pulldown 3x12") into structured exercises matched
// against the exercise catalogue.
//
// Used in two places with slightly different intent:
//   "plan" — building a recurring day, so numbers are targets
//   "log"  — recording what was actually done, so numbers fill in real sets

import { getOpenAITextResponse } from "./chat-service";
import {
  ExerciseDef,
  ExerciseMetric,
  customExerciseDef,
  findExerciseByName,
  searchExercises,
} from "../data/exerciseLibrary";

export interface SpokenExercise {
  /** Matched catalogue entry, or a generated custom definition */
  def: ExerciseDef;
  /** What the user actually said, kept so the UI can show unmatched names honestly */
  spokenName: string;
  /** True when the name did not match the catalogue and a custom entry was created */
  isCustom: boolean;
  sets?: number;
  reps?: number;
  /** In the unit the user spoke — converted by the caller */
  weight?: number;
  weightUnit?: "lb" | "kg";
  durationMinutes?: number;
  /** In the unit the user spoke */
  distance?: number;
  distanceUnit?: "mi" | "km";
}

interface RawParsedExercise {
  name?: string;
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
  weightUnit?: string | null;
  durationMinutes?: number | null;
  distance?: number | null;
  distanceUnit?: string | null;
}

const SYSTEM_PROMPT = `You convert dictated gym talk into structured JSON. You never chat, you only return JSON.

Return ONLY a JSON object of this exact shape, with no markdown fence and no commentary:
{"exercises":[{"name":"Bench Press","sets":3,"reps":8,"weight":185,"weightUnit":"lb","durationMinutes":null,"distance":null,"distanceUnit":null}]}

Rules:
- One array entry per distinct exercise, in the order spoken.
- "name" is the exercise name only, cleaned up and title-cased. No set/rep/weight words in it.
- "3x8", "three by eight", "three sets of eight" all mean sets=3, reps=8.
- "at 185", "with 185 pounds", "185s" means weight=185. weightUnit is "kg" only if kilos/kg were clearly said, otherwise "lb".
- If sets were spoken but reps were not (or vice versa), set the missing one to null. Never invent numbers.
- Cardio: "ran 3 miles in 25 minutes" gives distance=3, distanceUnit="mi", durationMinutes=25, and null sets/reps.
- Timed holds: "plank for 2 minutes" gives durationMinutes=2.
- Bodyweight moves ("pull-ups 3 sets of 10") have sets and reps but null weight.
- Ignore filler, greetings and self-corrections. If the speaker corrects themselves, keep only the corrected version.
- If nothing resembling an exercise was said, return {"exercises":[]}.`;

/** Strip a markdown fence if the model wrapped the JSON in one. */
const stripFence = (text: string) =>
  text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```$/, "")
    .trim();

const positiveInt = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
};

const positiveNum = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 100) / 100;
};

/**
 * Best-effort match of a spoken name onto the catalogue: exact name/alias first,
 * then the type-ahead search, then a custom definition so an unusual move still
 * gets logged instead of being silently dropped.
 */
function resolveExercise(
  spokenName: string,
  hasSetsOrReps: boolean,
  hasDistance: boolean,
  hasDuration: boolean
): { def: ExerciseDef; isCustom: boolean } {
  const exact = findExerciseByName(spokenName);
  if (exact) return { def: exact, isCustom: false };

  const [top] = searchExercises(spokenName, 1);
  if (top) return { def: top, isCustom: false };

  // Nothing matched — pick the metric that fits what was actually spoken so the
  // custom entry opens with the right inputs.
  const metric: ExerciseMetric = hasDistance
    ? "distance_duration"
    : hasDuration && !hasSetsOrReps
      ? "duration"
      : "weight_reps";
  return { def: customExerciseDef(spokenName, metric), isCustom: true };
}

/**
 * Parse a transcript into exercises. Throws with a user-readable message when
 * the transcript contains nothing usable, so callers can surface it directly.
 */
export async function parseSpokenExercises(transcript: string): Promise<SpokenExercise[]> {
  const clean = transcript.trim();
  if (clean.length === 0) throw new Error("No speech detected.");

  const response = await getOpenAITextResponse(
    [{ role: "user", content: `${SYSTEM_PROMPT}\n\nDictated: "${clean}"` }],
    { model: "gpt-4o-mini", temperature: 0, maxTokens: 1024 }
  );

  let parsed: { exercises?: RawParsedExercise[] };
  try {
    parsed = JSON.parse(stripFence(response.content));
  } catch {
    throw new Error("Could not make sense of that recording. Try again, one exercise at a time.");
  }

  const raw = Array.isArray(parsed.exercises) ? parsed.exercises : [];
  const out: SpokenExercise[] = [];

  for (const item of raw) {
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (name.length < 2) continue;

    const sets = positiveInt(item.sets);
    const reps = positiveInt(item.reps);
    const weight = positiveNum(item.weight);
    const durationMinutes = positiveInt(item.durationMinutes);
    const distance = positiveNum(item.distance);

    const { def, isCustom } = resolveExercise(
      name,
      sets != null || reps != null,
      distance != null,
      durationMinutes != null
    );

    out.push({
      def,
      spokenName: name,
      isCustom,
      sets,
      reps,
      weight,
      weightUnit: item.weightUnit === "kg" ? "kg" : "lb",
      durationMinutes,
      distance,
      distanceUnit: item.distanceUnit === "km" ? "km" : "mi",
    });
  }

  if (out.length === 0) {
    throw new Error(
      `No exercises were picked up in "${clean.slice(0, 60)}". Try something like "bench press, 3 sets of 8 at 185".`
    );
  }

  return out;
}
