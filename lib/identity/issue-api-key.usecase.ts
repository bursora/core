import type { IssuedApiKey } from "./api-key";
import type { ApiKeyAuditLogRepository } from "./api-key-audit-log.repository";
import { generateApiKeyPlaintext, hashApiKey } from "./api-key.crypto";
import type { ApiKeyRepository } from "./api-key.repository";

export interface IssueApiKeyInput {
    readonly workspaceId: string;
    readonly name: string;
    readonly pepper: string;
    readonly keys: ApiKeyRepository;
    readonly audit: ApiKeyAuditLogRepository;
    readonly scopes?: readonly string[];
    readonly userId?: string | null;
    readonly ip?: string | null;
}

export async function issueApiKeyUseCase(input: IssueApiKeyInput): Promise<IssuedApiKey> {
    const plaintext = generateApiKeyPlaintext(input.workspaceId);
    const keyHash = hashApiKey(plaintext, input.pepper);

    const stored = await input.keys.insert({
        workspaceId: input.workspaceId,
        keyHash,
        name: input.name,
        scopes: input.scopes ?? [],
    });

    await input.audit.record({
        workspaceId: stored.workspaceId,
        apiKeyId: stored.id,
        action: "create",
        metadata: { name: stored.name },
        userId: input.userId ?? null,
        ip: input.ip ?? null,
    });

    return {
        id: stored.id,
        workspaceId: stored.workspaceId,
        name: stored.name,
        plaintext,
        createdAt: stored.createdAt,
    };
}
