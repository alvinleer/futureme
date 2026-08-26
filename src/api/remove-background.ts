import * as FileSystem from "expo-file-system/legacy";
import { useAuthStore } from "../state/authStore";

const BACKEND_URL = (process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Removes the background from an image using the Pixa API (via backend proxy).
 * Returns a transparent PNG so the app's teal gradient shows through.
 */
export async function removeBackground(imageUri: string): Promise<string> {
  try {
    const token = useAuthStore.getState().token;

    const formData = new FormData();
    formData.append("image_file", {
      uri: imageUri,
      type: "image/jpeg",
      name: "photo.jpg",
    } as any);

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${BACKEND_URL}/api/images/remove-background`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      return imageUri;
    }

    const data = await response.json() as { imageBase64: string };
    const outputPath = `${FileSystem.documentDirectory}bg_removed_${Date.now()}.png`;
    await FileSystem.writeAsStringAsync(outputPath, data.imageBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return outputPath;
  } catch {
    return imageUri;
  }
}

export async function removeBackgroundBatch(imageUris: string[]): Promise<string[]> {
  return Promise.all(imageUris.map((uri) => removeBackground(uri)));
}
