import * as FileSystem from "expo-file-system/legacy";

/**
 * Strips a full absolute file path to just the filename.
 * Remote URLs (http/https) are returned unchanged.
 * If already a plain filename, returns as-is.
 *
 * Store ONLY filenames — never absolute paths — so that the path remains
 * valid across iOS app updates (which can change the container UUID).
 */
export function toPhotoFilename(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
  const parts = uri.split("/");
  return parts[parts.length - 1] || uri;
}

/**
 * Resolves a stored photo value (filename or legacy absolute path) to a
 * usable absolute URI using the current documentDirectory.
 *
 * Handles three cases:
 *  - null / undefined → null
 *  - remote URL (http/https) → unchanged
 *  - absolute path (legacy, e.g. from old app install) → extract filename,
 *    prepend current FileSystem.documentDirectory
 *  - plain filename (new format) → prepend current FileSystem.documentDirectory
 */
export function resolvePhotoUri(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith("http://") || stored.startsWith("https://")) return stored;
  if (stored.startsWith("/")) {
    const filename = stored.split("/").pop();
    if (!filename) return null;
    return `${FileSystem.documentDirectory}${filename}`;
  }
  return `${FileSystem.documentDirectory}${stored}`;
}
