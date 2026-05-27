import type {
    ApiKeyAuditLogEntry,
    ApiKeyAuditLogRepository,
    RecordApiKeyAuditLogInput,
} from "@/lib/identity";
import { randomUUID } from "node:crypto";

export class InMemoryApiKeyAuditLogRepository implements ApiKeyAuditLogRepository {
    readonly entries: ApiKeyAuditLogEntry[] = [];

    async record(input: RecordApiKeyAuditLogInput): Promise<ApiKeyAuditLogEntry> {
        const entry: ApiKeyAuditLogEntry = {
            id: randomUUID(),
            workspaceId: input.workspaceId,
            apiKeyId: input.apiKeyId,
            userId: input.userId ?? null,
            action: input.action,
            metadata: input.metadata ?? null,
            ip: input.ip ?? null,
            ts: new Date(),
        };
        this.entries.push(entry);
        return entry;
    }
}
