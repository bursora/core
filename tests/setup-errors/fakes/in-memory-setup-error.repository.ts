import type { SetupErrorCategory } from "@/lib/setup-errors/category";
import type { SetupErrorBucketRow, SetupErrorRepository } from "@/lib/setup-errors/server";

interface Row {
    workspaceId: string | null;
    category: SetupErrorCategory;
    bucketHour: Date;
    count: number;
}

export class InMemorySetupErrorRepository implements SetupErrorRepository {
    readonly rows: Row[] = [];

    async incrementBucket(input: {
        workspaceId: string | null;
        category: SetupErrorCategory;
        bucketHour: Date;
    }): Promise<{ created: boolean }> {
        const existing = this.rows.find(
            (r) =>
                r.workspaceId === input.workspaceId &&
                r.category === input.category &&
                r.bucketHour.getTime() === input.bucketHour.getTime(),
        );
        if (existing) {
            existing.count += 1;
            return { created: false };
        }
        this.rows.push({
            workspaceId: input.workspaceId,
            category: input.category,
            bucketHour: input.bucketHour,
            count: 1,
        });
        return { created: true };
    }

    async sumByCategorySince(input: {
        workspaceId: string;
        since: Date;
    }): Promise<readonly SetupErrorBucketRow[]> {
        const totals = new Map<SetupErrorCategory, { count: number; latestBucketHour: Date }>();
        for (const row of this.rows) {
            if (row.workspaceId !== input.workspaceId) continue;
            if (row.bucketHour.getTime() < input.since.getTime()) continue;
            const existing = totals.get(row.category);
            if (existing) {
                existing.count += row.count;
                if (row.bucketHour.getTime() > existing.latestBucketHour.getTime()) {
                    existing.latestBucketHour = row.bucketHour;
                }
                continue;
            }
            totals.set(row.category, {
                count: row.count,
                latestBucketHour: row.bucketHour,
            });
        }
        return [...totals.entries()].map(([category, { count, latestBucketHour }]) => ({
            category,
            count,
            latestBucketHour,
        }));
    }
}
