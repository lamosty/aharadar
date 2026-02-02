import bcrypt from "bcrypt";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Generate a cryptographically secure random token
 * @param bytes Number of random bytes (default: 32)
 * @returns Base64url-encoded token
 */
export function generateToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Hash a token using SHA-256
 * @param token Plain text token
 * @returns Hex-encoded hash
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// -----------------------------------------------------------------------------
// Password Hashing (bcrypt)
// -----------------------------------------------------------------------------

const SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 * @param password Plain text password
 * @returns Bcrypt hash
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a bcrypt hash
 * @param password Plain text password
 * @param hash Bcrypt hash
 * @returns True if password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// -----------------------------------------------------------------------------
// AES-256-GCM Encryption for API Keys
// -----------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const AUTH_TAG_LENGTH = 16;

export interface EncryptedData {
  encrypted: Buffer;
  iv: Buffer;
}

/**
 * Encrypt an API key using AES-256-GCM.
 * The auth tag is appended to the encrypted data.
 */
export function encryptApiKey(plainKey: string, masterKey: Buffer): EncryptedData {
  if (masterKey.length !== 32) {
    throw new Error("Master key must be 32 bytes for AES-256");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plainKey, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  return { encrypted, iv };
}

/**
 * Decrypt an API key using AES-256-GCM.
 * Expects auth tag appended to encrypted data.
 */
export function decryptApiKey(encrypted: Buffer, iv: Buffer, masterKey: Buffer): string {
  if (masterKey.length !== 32) {
    throw new Error("Master key must be 32 bytes for AES-256");
  }

  const authTag = encrypted.subarray(-AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(0, -AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, masterKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Get the master encryption key from environment.
 * In production, consider using a KMS instead.
 */
export function getMasterKey(): Buffer {
  const keyHex = process.env.APP_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error("APP_ENCRYPTION_KEY environment variable is required");
  }
  if (keyHex.length !== 64) {
    throw new Error("APP_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(keyHex, "hex");
}

/**
 * Extract the last N characters of a key for display purposes.
 */
export function getKeySuffix(key: string, length: number = 4): string {
  return key.slice(-length);
}
