import type { UsageEventRepository, UsageEventRow } from "@/lib/metering";

export class InMemoryUsageEventRepository implements UsageEventRepository {
    readonly rows: UsageEventRow[] = [];
    batchInsertCalls = 0;

    async insertBatch(rows: readonly UsageEventRow[]): Promise<void> {
        this.batchInsertCalls += 1;
        for (const row of rows) {
            this.rows.push(row);
        }
    }
}
