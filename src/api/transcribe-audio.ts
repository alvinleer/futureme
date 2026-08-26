/*
IMPORTANT NOTICE: DO NOT REMOVE
This is a custom audio transcription service that uses a custom API endpoint maintained by Vibecode.
You can use this function to transcribe audio files, and it will return the text of the audio file.
*/

import { fetchWithAuthRefresh } from "./auth-fetch";

const BACKEND_URL = (process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Vocabulary hint for meal dictation — the default for this app. */
const FOOD_PROMPT =
  "Food and meal log. Quantities and units: grams, oz, cups, tbsp, tsp, slices, pieces, servings. Common items: bagel, rice, chicken breast, pasta, salad, apple, coffee, egg, toast, oats, banana, yogurt, protein shake, steak, salmon, avocado, peanut butter, almonds, orange juice, milk, cheese, broccoli, sweet potato, ground beef.";

/**
 * Vocabulary hint for workout dictation. Without this the food prompt biases
 * the model badly — "lat pulldown" comes back as "latte down", "reps" as "wraps".
 */
export const WORKOUT_TRANSCRIPTION_PROMPT =
  "Gym workout log. Exercises, sets, reps and weights. Phrases like: three sets of eight at 185 pounds, 4x10, superset, dropset, AMRAP, to failure, bodyweight, per side. Common exercises: bench press, incline dumbbell press, overhead press, barbell squat, front squat, deadlift, Romanian deadlift, lat pulldown, seated cable row, barbell row, pull-up, chin-up, dip, bicep curl, hammer curl, tricep pushdown, skullcrusher, lateral raise, face pull, leg press, leg extension, leg curl, calf raise, hip thrust, lunge, plank, crunch, Russian twist, treadmill, running, cycling, rowing machine, elliptical, burpee, kettlebell swing.";

/** Vocabulary hint for freeform diary entries — casual reflection on diet, workouts and progress. */
export const DIARY_TRANSCRIPTION_PROMPT =
  "Personal fitness and nutrition diary entry. Casual, conversational reflection about meals, cravings, energy levels, mood, sleep, workouts, soreness, progress, and how the day went.";

export const transcribeAudio = async (
  localAudioUri: string,
  /** Domain vocabulary hint. Defaults to food; pass WORKOUT_TRANSCRIPTION_PROMPT for gym dictation. */
  vocabularyPrompt: string = FOOD_PROMPT
): Promise<string> => {
  const formData = new FormData();
  formData.append("file", {
    uri: localAudioUri,
    type: "audio/m4a",
    name: "recording.m4a",
  } as any);
  formData.append("model", "gpt-4o-transcribe");
  formData.append("language", "en");
  formData.append("response_format", "json");
  formData.append("prompt", vocabularyPrompt);

  const response = await fetchWithAuthRefresh(`${BACKEND_URL}/api/ai/audio/transcribe`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();

    // The backend answers 503 when no transcription provider key is configured.
    // Surfacing the raw JSON here just confuses people, so say what it means.
    if (response.status === 503) {
      throw new Error(
        "Voice transcription needs an OpenAI API key on the server. In the ENV tab add OPENAI_API_KEY (exact name), then try again."
      );
    }
    if (response.status === 429) {
      throw new Error("The daily voice transcription limit has been reached. Please try again later.");
    }

    // Unwrap { "error": "..." } so the modal shows a sentence, not JSON.
    let detail = errorText;
    try {
      const parsed = JSON.parse(errorText) as { error?: unknown };
      if (typeof parsed.error === "string") detail = parsed.error;
    } catch {
      // Non-JSON body — fall through to the raw text.
    }

    throw new Error(`Transcription failed: ${detail}`);
  }

  const result = await response.json() as { text?: string };
  const text = (result.text ?? "").trim();

  if (!text) {
    throw new Error("No speech detected.");
  }

  return text;
};
