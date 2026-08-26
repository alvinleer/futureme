/*
IMPORTANT NOTICE: DO NOT REMOVE
This is a custom asset generation service using OpenAI GPT Image API.
Model ID: gpt-image-1
Features:
- High quality image generation
- Supports reference images for consistency
- Text rendering capabilities
*/

import * as FileSystem from "expo-file-system/legacy";
import { useAuthStore } from "../state/authStore";

const BACKEND_URL = (process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

const authHeaders = (): Record<string, string> => {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Analyze an image for inappropriate content (nudity, explicit material)
 * @param imageUri Local file URI of the image to check
 * @returns Object with isAppropriate boolean and reason if inappropriate
 */
export async function checkImageAppropriateness(
  imageUri: string
): Promise<{ isAppropriate: boolean; reason?: string }> {
  try {
    const base64Image = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const extension = imageUri.split(".").pop()?.toLowerCase();
    let mimeType = "image/jpeg";
    if (extension === "png") mimeType = "image/png";
    else if (extension === "webp") mimeType = "image/webp";

    const response = await fetch(`${BACKEND_URL}/api/ai/image/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        imageBase64: base64Image,
        mimeType,
        detail: "low",
        maxTokens: 100,
        prompt: `Analyze this image for a fitness progress tracking app. Fitness progress photos are the primary use case.

ALWAYS ALLOW (respond {"appropriate": true}):
- Shirtless males showing torso, chest, abs
- Females in sports bras, bikini tops, bras, or crop tops
- Swimwear including bikinis, one-pieces, board shorts
- Underwear or form-fitting clothing for body composition photos
- Any standard gym or workout attire
- Before/after body transformation photos
- Any amount of skin shown in a fitness context

ONLY REJECT (respond {"appropriate": false}) for:
- Explicit genitalia or fully nude below the waist
- Graphic sexual acts or pornographic content

Respond with ONLY valid JSON — no other text:
{"appropriate": true}
OR
{"appropriate": false, "reason": "brief reason"}

Default to allowing the image. Fitness apps require body photos.`,
      }),
    });

    if (!response.ok) return { isAppropriate: true };

    const data = await response.json() as { content: string };
    const jsonMatch = data.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      if (result.appropriate === false) {
        return { isAppropriate: false, reason: result.reason || "Image contains inappropriate content" };
      }
    }
    return { isAppropriate: true };
  } catch {
    return { isAppropriate: true };
  }
}

/**
 * Analyze a reference image and get a detailed description for image generation
 * @param imageUri Local file URI of the reference image
 * @returns Detailed description of the person's appearance
 */
async function analyzeReferenceImage(imageUri: string): Promise<string> {
  const base64Image = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const extension = imageUri.split(".").pop()?.toLowerCase();
  let mimeType = "image/jpeg";
  if (extension === "png") mimeType = "image/png";
  else if (extension === "webp") mimeType = "image/webp";

  const response = await fetch(`${BACKEND_URL}/api/ai/image/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      imageBase64: base64Image,
      mimeType,
      detail: "high",
      maxTokens: 500,
      prompt: `Describe this person's physical appearance in detail for creating a fitness portrait. Include:
- Approximate age range
- Gender
- Ethnicity/skin tone
- Hair color, style, and length
- Facial features (face shape, eye color if visible)
- Body type/build
- Any distinctive features

Provide a concise but detailed description that could be used to recreate their likeness in a professional fitness photo. Focus only on physical appearance, not clothing or background.`,
    }),
  });

  if (!response.ok) throw new Error("Failed to analyze reference image");

  const data = await response.json() as { content: string };
  return data.content || "";
}

/**
 * Generate an image using OpenAI GPT Image API
 * @param prompt The text prompt to generate an image from
 * @param options Optional parameters for image generation
 * @returns URL of the generated image (local file URI)
 */
export async function generateImage(
  prompt: string,
  options?: {
    size?: "1024x1024" | "1536x1024" | "1024x1536" | "auto";
    quality?: "low" | "medium" | "high" | "auto";
    format?: "png" | "jpeg" | "webp";
    background?: undefined | "transparent";
    referenceImages?: string[]; // Array of local file URIs to use as reference
  }
): Promise<string> {
  const size = options?.size || "1024x1024";
  const quality = options?.quality || "medium";

  let finalPrompt = prompt;

  if (options?.referenceImages && options.referenceImages.length > 0) {
    try {
      const appearanceDescription = await analyzeReferenceImage(options.referenceImages[0]);
      finalPrompt = `${prompt}

IMPORTANT - The person in this image must match this exact appearance:
${appearanceDescription}

Create a photorealistic fitness portrait of this specific person.`;
    } catch {
      // Continue with original prompt if analysis fails
    }
  }

  const response = await fetch(`${BACKEND_URL}/api/ai/image/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ prompt: finalPrompt, size, quality }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes("content_policy") || errorText.includes("safety")) {
      throw new Error("The image request could not be completed. Please try a different photo or adjust your profile settings.");
    }
    throw new Error(`Image generation failed: ${errorText}`);
  }

  const data = await response.json() as { b64_json?: string; url?: string };

  let outputPath: string;
  if (data.b64_json) {
    outputPath = `${FileSystem.cacheDirectory}generated_${Date.now()}.png`;
    await FileSystem.writeAsStringAsync(outputPath, data.b64_json, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } else if (data.url) {
    outputPath = `${FileSystem.cacheDirectory}generated_${Date.now()}.png`;
    await FileSystem.downloadAsync(data.url, outputPath);
  } else {
    throw new Error("Image generation was not successful. Please try again with a different photo.");
  }

  return outputPath;
}

/**
 * Convert aspect ratio to size format (legacy support)
 * @param aspectRatio The aspect ratio to convert
 * @returns The corresponding size format
 */
export function convertAspectRatioToSize(
  aspectRatio: string
): "1024x1024" | "1536x1024" | "1024x1536" | "auto" {
  switch (aspectRatio) {
    case "1:1":
      return "1024x1024";
    case "3:2":
      return "1536x1024";
    case "2:3":
      return "1024x1536";
    default:
      return "auto";
  }
}
