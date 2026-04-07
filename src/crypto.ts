/**
 * crypto.ts
 * Handles encryption and decryption of .env file contents
 * using AES-256-GCM for authenticated encryption.
 */

import * as crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits recommended for GCM
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = "sha256";

export interface EncryptedPayload {
  /** Base64-encoded salt used for key derivation */
  salt: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Base64-encoded authentication tag */
  tag: string;
  /** Base64-encoded ciphertext */
  data: string;
}

/**
 * Derives a cryptographic key from a passphrase and salt using PBKDF2.
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    passphrase,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    PBKDF2_DIGEST
  );
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param plaintext - The raw .env file content to encrypt
 * @param passphrase - The user-supplied passphrase or vault secret
 * @returns An EncryptedPayload containing all data needed for decryption
 */
export function encrypt(plaintext: string, passphrase: string): EncryptedPayload {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

/**
 * Decrypts an EncryptedPayload back to plaintext using AES-256-GCM.
 * @param payload - The encrypted payload object
 * @param passphrase - The passphrase used during encryption
 * @returns The original plaintext string
 * @throws If the passphrase is wrong or the data has been tampered with
 */
export function decrypt(payload: EncryptedPayload, passphrase: string): string {
  const salt = Buffer.from(payload.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");

  const key = deriveKey(passphrase, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error(
      "Decryption failed: invalid passphrase or corrupted data."
    );
  }
}

/**
 * Serializes an EncryptedPayload to a compact JSON string for storage or transport.
 */
export function serializePayload(payload: EncryptedPayload): string {
  return JSON.stringify(payload);
}

/**
 * Deserializes a JSON string back into an EncryptedPayload.
 * @param raw - The JSON string previously produced by serializePayload
 * @returns A validated EncryptedPayload object
 * @throws If the string is not valid JSON or is missing required fields
 */
export function deserializePayload(raw: string): EncryptedPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Failed to parse encrypted payload: invalid JSON.");
  }

  const obj = parsed as Record<string, unknown>;
  const requiredKeys: (keyof EncryptedPayload)[] = ["salt", "iv", "tag", "data"];
  for (const key of requiredKeys) {
    if (typeof obj[key] !== "string") {
      throw new Error(`Invalid encrypted payload: missing or non-string field "${key}".`);
    }
  }

  return obj as unknown as EncryptedPayload;
}
