/**
 * API key aggregate.
 *
 * Plaintext keys are shaped `bsk_<workspaceId>_<32-char base16 secret>`. We
 * store only the HMAC-SHA256 of the plaintext, computed with the server-side
 * `BURSORA_API_KEY_PEPPER`. Plaintext is shown to the user exactly once at
 * issue time and never again.
 *
 * `id` is the row primary key — used for revocation and audit references.
 * The SDK sends the plaintext (see SPEC §8), not the id.
 */

export interface ApiKey {
    readonly id: string;
    readonly workspaceId: string;
    readonly keyHash: string;
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
