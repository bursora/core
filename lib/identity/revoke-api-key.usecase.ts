import type { ApiKeyAuditLogRepository } from "./api-key-audit-log.repository";
import type { ApiKeyRepository } from "./api-key.repository";

export interface RevokeApiKeyInput {
    readonly id: string;
    readonly workspaceId: string;
    readonly keys: ApiKeyRepository;
    readonly audit: ApiKeyAuditLogRepository;
    readonly userId?: string | null;
    readonly ip?: string | null;
}

/**
 * Marks an API key revoked, scoped to the caller's workspace. Returns true
 * when a row was updated. Returns false when the key does not exist or
 * belongs to a different workspace — callers SHOULD treat false as "not
 * found" to avoid leaking the existence of foreign keys.
 *
 * Writes an audit entry only when the underlying mutation succeeded so
 * the log never claims an event that did not happen.
 */
export async function revokeApiKeyUseCase(input: RevokeApiKeyInput): Promise<boolean> {
    const revoked = await input.keys.revoke(input.id, input.workspaceId, new Date());
    if (!revoked) return false;

    await input.audit.record({
        workspaceId: input.workspaceId,
        apiKeyId: input.id,
        action: "revoke",
        userId: input.userId ?? null,
        ip: input.ip ?? null,
    });
    return true;
}
