import type { UsageEventRepository, UsageEventRow } from "@/lib/metering";

/**
 * Dumb sink mirroring the ClickHouse MergeTree: it has no `ON CONFLICT`, so it
 * writes every row given and reports that count. Idempotency lives upstream in
 * the ingest use-case (the Redis dedup guard), so the dedup tests exercise the
 * guard rather than this fake.
 */
export class InMemoryUsageEventRepository implements UsageEventRepository {
    readonly rows: UsageEventRow[] = [];
    batchInsertCalls = 0;

    async insertBatch(rows: readonly UsageEventRow[]): Promise<number> {
        this.batchInsertCalls += 1;
        this.rows.push(...rows);
        return rows.length;
    }

    async eraseByWorkspaces(workspaceIds: readonly string[]): Promise<void> {
        const ids = new Set(workspaceIds);
        for (let i = this.rows.length - 1; i >= 0; i -= 1) {
            const row = this.rows[i];
            if (row && ids.has(row.workspaceId)) this.rows.splice(i, 1);
        }
    }
}
