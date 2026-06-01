/**
 * API key aggregate.
 *
 * Plaintext keys are shaped `bsk_<workspaceId>_<32-char base16 secret>`.
 * Requests authenticate against the HMAC-SHA256 of the plaintext, computed
 * with the server-side `BURSORA_API_KEY_PEPPER`. The plaintext is also sealed
 * at rest with AES-256-GCM (`cipherText`/`cipherIv`/`cipherAuthTag`) so a
 * workspace member can reveal and copy it on demand.
 *
 * `id` is the row primary key — used for revocation, reveal, and audit
 * references. The SDK sends the plaintext (see SPEC §8), not the id.
 */

export interface ApiKeySeal {
    readonly cipherText: string;
    readonly cipherIv: string;
    readonly cipherAuthTag: string;
}

export interface ApiKey {
    readonly id: string;
    readonly workspaceId: string;
    readonly keyHash: string;
    /**
     * Sealed plaintext. NULL on keys issued before encryption at rest existed —
     * those cannot be revealed and must be rotated to enable copy.
     */
    readonly seal: ApiKeySeal | null;
    /**
     * Non-secret display hint: trailing 6 chars of the plaintext, persisted at
     * issue time so the masked list can show a Stripe-style suffix without
     * decrypting the seal. NULL on legacy rows issued before this existed.
     */
    readonly last6: string | null;
    readonly name: string;
    readonly scopes: readonly string[];
    readonly createdAt: Date;
    readonly revokedAt: Date | null;
}

export interface IssuedApiKey {
    readonly id: string;
    readonly workspaceId: string;
    readonly name: string;
    readonly plaintext: string;
    readonly createdAt: Date;
}

export interface ApiKeyLookup {
    readonly id: string;
    readonly workspaceId: string;
    readonly scopes: readonly string[];
}

export const API_KEY_PREFIX = "bsk_";
export const API_KEY_RANDOM_LENGTH = 32;
