import { createHash, createHmac, randomBytes } from "node:crypto";
import { API_KEY_PREFIX, API_KEY_RANDOM_LENGTH } from "./api-key";

/**
 * HMAC-SHA256 of the plaintext key using the server-side pepper. We only ever
 * persist the hex digest. Plaintext is never written anywhere.
 */
export function hashApiKey(plaintext: string, pepper: string): string {
    if (pepper.length === 0) {
        throw new Error("BURSORA_API_KEY_PEPPER must not be empty");
    }
    return createHmac("sha256", pepper).update(plaintext).digest("hex");
}

/**
 * Mint a fresh API key plaintext. Format: `bsk_<workspaceId>_<random>` where
 * `<random>` is `API_KEY_RANDOM_LENGTH` lowercase hex characters drawn from a
 * cryptographically secure RNG.
 */
export function generateApiKeyPlaintext(workspaceId: string): string {
    const bytes = Math.ceil(API_KEY_RANDOM_LENGTH / 2);
    const random = randomBytes(bytes).toString("hex").slice(0, API_KEY_RANDOM_LENGTH);
    return `${API_KEY_PREFIX}${workspaceId}_${random}`;
}

/**
 * Parse a plaintext key back into its workspace + secret components. Returns
 * null when the input does not match the expected shape.
 */
export function parseApiKeyPlaintext(
    plaintext: string,
): { workspaceId: string; secret: string } | null {
    if (!plaintext.startsWith(API_KEY_PREFIX)) return null;
    const rest = plaintext.slice(API_KEY_PREFIX.length);
    const lastUnderscore = rest.lastIndexOf("_");
    if (lastUnderscore <= 0) return null;
    const workspaceId = rest.slice(0, lastUnderscore);
    const secret = rest.slice(lastUnderscore + 1);
    if (workspaceId.length === 0 || secret.length !== API_KEY_RANDOM_LENGTH) {
        return null;
    }
    return { workspaceId, secret };
}

/**
 * Short non-secret digest of a plaintext key. Eight hex chars of SHA-256 —
 * enough to correlate auth failures across logs without exposing the key.
 */
export function apiKeyHashPrefix(plaintext: string): string {
    return createHash("sha256").update(plaintext).digest("hex").slice(0, 8);
}
