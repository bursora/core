import type { ApiKeyLookup } from "./api-key";
import { hashApiKey, parseApiKeyPlaintext } from "./api-key.crypto";
import type { ApiKeyRepository } from "./api-key.repository";

export interface LookupApiKeyInput {
    readonly plaintext: string;
    readonly pepper: string;
    readonly keys: ApiKeyRepository;
}

export async function lookupApiKeyUseCase(input: LookupApiKeyInput): Promise<ApiKeyLookup | null> {
    const parsed = parseApiKeyPlaintext(input.plaintext);
    if (!parsed) return null;

    const keyHash = hashApiKey(input.plaintext, input.pepper);
    const row = await input.keys.findByHash(keyHash);
    if (!row) return null;
    if (row.revokedAt !== null) return null;
    if (row.workspaceId !== parsed.workspaceId) return null;

    return {
        id: row.id,
        workspaceId: row.workspaceId,
        scopes: row.scopes,
    };
}
