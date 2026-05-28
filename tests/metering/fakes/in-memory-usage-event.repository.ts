import type { UsageEventRepository, UsageEventRow } from "@/lib/metering";

export class InMemoryUsageEventRepository implements UsageEventRepository {
    readonly rows: UsageEventRow[] = [];
    batchInsertCalls = 0;

    async insertBatch(rows: readonly UsageEventRow[]): Promise<number> {
        this.batchInsertCalls += 1;
        let inserted = 0;
        for (const row of rows) {
            // Mirrors the partial unique index `(workspace_id, request_id)
            // WHERE request_id IS NOT NULL` from migration 0037. Rows that
            // collide are silently dropped (Postgres `ON CONFLICT DO NOTHING`)
            // and excluded from the returned count, just like Postgres
            // RETURNING after ON CONFLICT DO NOTHING.
            if (row.requestId !== null && this.findExistingByRequestId(row) !== null) continue;
            this.rows.push(row);
            inserted += 1;
        }
        return inserted;
    }

    private findExistingByRequestId(row: UsageEventRow): UsageEventRow | null {
        return (
            this.rows.find(
                (r) => r.workspaceId === row.workspaceId && r.requestId === row.requestId,
            ) ?? null
        );
    }
}
