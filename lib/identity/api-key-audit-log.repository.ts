/**
 * Append-only audit trail for API key lifecycle events (create / revoke /
 * rename / reveal). Every successful mutation against `api_keys`, plus each
 * plaintext reveal, is recorded here so the workspace can answer "who did
 * what, from where, when?" without reconstructing it from logs.
 */

export type ApiKeyAuditAction = "create" | "revoke" | "rename" | "reveal";

export interface ApiKeyAuditLogEntry {
    readonly id: string;
    readonly workspaceId: string;
    readonly apiKeyId: string;
    readonly userId: string | null;
    readonly action: ApiKeyAuditAction;
    readonly metadata: Record<string, unknown> | null;
    readonly ip: string | null;
    readonly ts: Date;
}

export interface RecordApiKeyAuditLogInput {
    readonly workspaceId: string;
    readonly apiKeyId: string;
    readonly action: ApiKeyAuditAction;
    readonly userId?: string | null;
    readonly metadata?: Record<string, unknown> | null;
    readonly ip?: string | null;
}

export interface ApiKeyAuditLogRepository {
    record(input: RecordApiKeyAuditLogInput): Promise<ApiKeyAuditLogEntry>;
}
