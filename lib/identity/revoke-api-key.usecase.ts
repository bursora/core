import type { ApiKeyRepository } from "./api-key.repository";

export interface RevokeApiKeyInput {
    readonly id: string;
    readonly workspaceId: string;
    readonly keys: ApiKeyRepository;
}

/**
 * Marks an API key revoked, scoped to the caller's workspace. Returns true
 * when a row was updated. Returns false when the key does not exist or
 * belongs to a different workspace — callers SHOULD treat false as "not
 * found" to avoid leaking the existence of foreign keys.
 */
export async function revokeApiKeyUseCase(input: RevokeApiKeyInput): Promise<boolean> {
    return input.keys.revoke(input.id, input.workspaceId, new Date());
}
