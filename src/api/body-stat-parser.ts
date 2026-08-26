/**
 * Detects and parses body stat updates from voice transcription.
 * Handles weight updates and body measurements (waist, arms, etc.)
 */

import { getOpenAITextResponse } from "./chat-service";

const BODY_STAT_SYSTEM_PROMPT = `You are a body stat parsing engine. Your job is to detect if a user's spoken input describes a body stat update (weight or body measurement), and extract the value.

OUTPUT (STRICT JSON ONLY)
Return ONLY a JSON object. No explanation, no markdown, no code fences.

If the input is a weight update (e.g. "I weigh 80 kg", "my weight is 175 pounds", "I'm 85 kilos"):
{
  "type": "weight",
  "value": <number>,
  "unit": "kg" | "lbs"
}

If the input is a body measurement (e.g. "my waist is 32 inches", "bicep is 38 cm", "I measured my chest at 100 centimeters"):
{
  "type": "measurement",
  "value": <number>,
  "unit": "cm" | "in",
  "bodyPart": <string — capitalized body part name, e.g. "Waist", "Chest", "Bicep", "Hip", "Thigh", "Neck", "Forearm", "Calf">
}

If the input is NOT a body stat update (it is food, a question, or something else entirely):
{
  "type": "none"
}

RULES:
- Only return "weight" or "measurement" if you are highly confident the user is logging a body stat.
- For weight, accept kg, kilos, kilograms, lbs, pounds.
- For measurements, accept cm, centimeters, in, inches, ".
- If the unit is ambiguous but the value makes sense for one unit (e.g. 32 is clearly inches for waist), infer the most likely unit.
- Body part names should be capitalized and singular (e.g. "Waist" not "waist" or "waists").`;

export interface BodyStatResult {
  type: "weight" | "measurement" | "none";
  value?: number;
  unit?: string;
  bodyPart?: string;
}

export async function parseBodyStatUpdate(transcription: string): Promise<BodyStatResult> {
  try {
    const response = await getOpenAITextResponse(
      [
        { role: "system", content: BODY_STAT_SYSTEM_PROMPT },
        { role: "user", content: transcription },
      ],
      { maxTokens: 128, temperature: 0 }
    );

    const raw = response.content.trim();
    const parsed = JSON.parse(raw) as BodyStatResult;
    if (!parsed.type || !["weight", "measurement", "none"].includes(parsed.type)) {
      return { type: "none" };
    }
    return parsed;
  } catch {
    return { type: "none" };
  }
}
