import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
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

        if (!row) throw new Error("api_key_audit_log insert returned no row");

        return {
            id: row.id,
            workspaceId: row.workspaceId,
            apiKeyId: row.apiKeyId,
            userId: row.userId,
            action: row.action as ApiKeyAuditLogEntry["action"],
            metadata: (row.metadata as Record<string, unknown> | null) ?? null,
            ip: row.ip,
            ts: row.ts,
        };
    }
}
