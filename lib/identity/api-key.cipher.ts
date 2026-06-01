import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated encryption of API key plaintext at rest.
 *
 * The hash (see `api-key.crypto.ts`) authenticates requests; this cipher is
 * additive: it lets the dashboard show a key to its workspace members on
 * demand. The plaintext is sealed with AES-256-GCM under the app's encryption
 * key (`BURSORA_KEY`, a base64 32-byte secret like Laravel's APP_KEY). The key
 * never leaves the server and is never written to the database.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface SealedApiKey {
    /** Base64 ciphertext. */
    readonly cipherText: string;
    /** Base64 12-byte GCM nonce. Fresh per encryption. */
    readonly iv: string;
    /** Base64 16-byte GCM authentication tag. */
    readonly authTag: string;
}

/**
 * Decode + validate the base64 KEK into a 32-byte buffer. Throws when the key
 * is empty or does not decode to exactly 32 bytes so misconfiguration fails
 * fast at startup rather than at first reveal.
 */
export function parseEncryptionKey(base64Key: string): Buffer {
    if (base64Key.length === 0) {
        throw new Error("BURSORA_KEY must not be empty");
    }
    const key = Buffer.from(base64Key, "base64");
    if (key.length !== KEY_BYTES) {
        throw new Error(`BURSORA_KEY must decode to ${KEY_BYTES} bytes (got ${key.length})`);
    }
    return key;
}

export function encryptApiKey(plaintext: string, key: Buffer): SealedApiKey {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const cipherText = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return {
        cipherText: cipherText.toString("base64"),
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
    };
}

/**
 * Decrypt a sealed key. Throws when the auth tag does not verify — a tampered
 * ciphertext, tag, iv, or a wrong key all surface as an exception, never a
 * silently corrupted plaintext.
 */
export function decryptApiKey(sealed: SealedApiKey, key: Buffer): string {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(sealed.cipherText, "base64")),
        decipher.final(),
    ]);
    return plaintext.toString("utf8");
}
