import type { ApiKeyAuditLogRepository } from "./api-key-audit-log.repository";
import type { ApiKeyRepository } from "./api-key.repository";

export interface RenameApiKeyInput {
    readonly id: string;
    readonly workspaceId: string;
    readonly name: string;
    readonly keys: ApiKeyRepository;
    readonly audit: ApiKeyAuditLogRepository;
    readonly userId?: string | null;
    readonly ip?: string | null;
}

export async function renameApiKeyUseCase(input: RenameApiKeyInput): Promise<boolean> {
    const renamed = await input.keys.rename(input.id, input.workspaceId, input.name);
    if (!renamed) return false;

    await input.audit.record({
        workspaceId: input.workspaceId,
        apiKeyId: input.id,
        action: "rename",
        metadata: { name: input.name },
        userId: input.userId ?? null,
        ip: input.ip ?? null,
    });
    return true;
}
