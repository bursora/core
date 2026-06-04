import "server-only";

import type { Db } from "@/lib/db";
import { requireInsertedRow, schema } from "@/lib/db";
import type {
    ApiKeyAuditLogEntry,
    ApiKeyAuditLogRepository,
    RecordApiKeyAuditLogInput,
} from "./api-key-audit-log.repository";

export class DrizzleApiKeyAuditLogRepository implements ApiKeyAuditLogRepository {
    constructor(private readonly db: Db) {}

    async record(input: RecordApiKeyAuditLogInput): Promise<ApiKeyAuditLogEntry> {
        const [row] = await this.db
            .insert(schema.apiKeyAuditLog)
            .values({
                workspaceId: input.workspaceId,
                apiKeyId: input.apiKeyId,
                userId: input.userId ?? null,
                action: input.action,
                metadata: input.metadata ?? null,
                ip: input.ip ?? null,
            })
            .returning();

        const inserted = requireInsertedRow(row, "api_key_audit_log");
        return {
            id: inserted.id,
            workspaceId: inserted.workspaceId,
            apiKeyId: inserted.apiKeyId,
            userId: inserted.userId,
            action: inserted.action as ApiKeyAuditLogEntry["action"],
            metadata: (inserted.metadata as Record<string, unknown> | null) ?? null,
            ip: inserted.ip,
            ts: inserted.ts,
        };
    }
}
