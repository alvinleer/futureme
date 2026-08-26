/**
 * AES-256-GCM field-level encryption utility.
 *
 * Used to encrypt sensitive personal data before storing in the database
 * so that a raw database file cannot be read by anyone — including app operators.
 *
 * Encrypted format: "<iv_hex>:<auth_tag_hex>:<ciphertext_hex>"
 * - iv:       12 random bytes (96-bit, recommended for GCM)
 * - auth_tag: 16 bytes GCM authentication tag (tamper detection)
 * - data:     AES-256-GCM ciphertext
 *
 * Requires ENCRYPTION_KEY env var: 64 hex characters (32 bytes / 256 bits).
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Add it to your .env file.");
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a string in the format: "<iv>:<authTag>:<ciphertext>" (all hex-encoded).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV — recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag(); // 16-byte authentication tag
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a ciphertext string produced by encrypt().
 * Throws if the data has been tampered with (GCM auth tag mismatch).
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted data format");
  const ivHex = parts[0]!;
  const authTagHex = parts[1]!;
  const dataHex = parts[2]!;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * Returns true if the string looks like a value produced by encrypt().
 * Useful for handling both legacy plaintext and new encrypted values.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}
