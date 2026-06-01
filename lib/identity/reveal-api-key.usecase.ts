import type { ApiKeyAuditLogRepository } from "./api-key-audit-log.repository";
import { decryptApiKey } from "./api-key.cipher";
import type { ApiKeyRepository } from "./api-key.repository";

export interface RevealApiKeyInput {
    readonly id: string;
    readonly workspaceId: string;
    /** 32-byte AES-256-GCM key-encryption key (see `parseEncryptionKey`). */
    readonly encryptionKey: Buffer;
    readonly keys: ApiKeyRepository;
    readonly audit: ApiKeyAuditLogRepository;
    readonly userId?: string | null;
    readonly ip?: string | null;
}

/**
 * Outcome of a reveal request.
 *   - `ok`              → the decrypted plaintext, ready to show the member.
 *   - `not_found`       → unknown id, foreign workspace, or revoked key. The
 *                         same code for all three so a member of workspace A
 *                         can't probe whether an id belongs to workspace B.
 *   - `not_recoverable` → the row predates encryption at rest; rotate to copy.
 */
export type RevealApiKeyResult =
    | { readonly kind: "ok"; readonly plaintext: string }
    | { readonly kind: "not_found" }
    | { readonly kind: "not_recoverable" };

/**
 * Decrypts and returns a key's plaintext for a workspace member.
 *
 * The lookup is scoped to the caller's workspace id (which the action layer
 * derives from the authenticated session, never the request body), so a
 * member of one workspace can never reveal another's key. Each successful
 * reveal writes an audit entry (who + when); the not-found and not-recoverable
 * paths write nothing.
 */
export async function revealApiKeyUseCase(input: RevealApiKeyInput): Promise<RevealApiKeyResult> {
    const row = await input.keys.findById(input.id, input.workspaceId);
    if (!row || row.revokedAt !== null) return { kind: "not_found" };
    if (!row.seal) return { kind: "not_recoverable" };

    const plaintext = decryptApiKey(
        {
            cipherText: row.seal.cipherText,
            iv: row.seal.cipherIv,
            authTag: row.seal.cipherAuthTag,
        },
        input.encryptionKey,
    );

    await input.audit.record({
        workspaceId: input.workspaceId,
        apiKeyId: input.id,
        action: "reveal",
        userId: input.userId ?? null,
        ip: input.ip ?? null,
    });

    return { kind: "ok", plaintext };
}
