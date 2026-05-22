/**
 * Drizzle implementation of the SpendSeriesSource port.
 *
 * Aggregates `usage_events.cost_usd` per (workspace_id, tenant_id, agent_id)
 * scope into 5-minute buckets since `since`. The bucket key is
 * `date_trunc('hour', ts) + interval '5 min' * floor(extract(minute from ts)/5)`
 * so each bucket starts on a 5-minute boundary.
 *
 * Buckets without any events are NOT returned — the detector treats absent
 * buckets as "no signal" rather than zero spend, which avoids false flat
 * lines for low-traffic agents.
 *
 * Returns scopes ordered by (workspace_id, tenant_id, agent_id) and points
 * inside each scope ordered by ts ascending.
 *
 * Memory bound: workspaces are paged through in batches; one batch's worth
 * of usage rows is held at a time. The previous all-workspaces-at-once
 * query held every recent event for every workspace in memory, which would
 * grow without bound as the customer base grew. Per-workspace iteration
 * keeps the cron's RSS independent of the number of workspaces.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { usageEvents, workspaces } from "@/lib/db";
import { and, asc, eq, gt, gte, sql, sum } from "drizzle-orm";
import type { SpendPoint } from "./detect-anomaly";
import type { ScopedSpendSeries, ScopeKey, SpendSeriesSource } from "./spend-series-source";

const WORKSPACE_BATCH = 100;

export const drizzleSpendSeriesSource = (db: Db): SpendSeriesSource => ({
    listScopedSeries: async (since: Date): Promise<readonly ScopedSpendSeries[]> => {
        const out: ScopedSpendSeries[] = [];
        let cursor: string | null = null;

        // Page through workspaces by id; for each batch, run the per-workspace
        // aggregation. Bounded memory regardless of total workspace count.
        while (true) {
            const workspaceRows: { id: string }[] = await db
                .select({ id: workspaces.id })
                .from(workspaces)
                .where(cursor === null ? undefined : gt(workspaces.id, cursor))
                .orderBy(asc(workspaces.id))
                .limit(WORKSPACE_BATCH);
            if (workspaceRows.length === 0) break;

            for (const { id: workspaceId } of workspaceRows) {
                const bucketTs = sql<
                    Date | string
                >`date_trunc('hour', ${usageEvents.ts}) + (floor(extract(minute from ${usageEvents.ts}) / 5) * interval '5 minutes')`;
                const rows = await db
                    .select({
                        tenantId: usageEvents.tenantId,
                        agentId: usageEvents.agentId,
                        bucketTs,
                        costUsd: sum(usageEvents.costUsd),
                    })
                    .from(usageEvents)
                    .where(
                        and(
                            eq(usageEvents.workspaceId, workspaceId),
                            eq(usageEvents.status, "ok"),
                            gte(usageEvents.ts, since),
                        ),
                    )
                    .groupBy(usageEvents.tenantId, usageEvents.agentId, bucketTs)
                    .orderBy(asc(usageEvents.tenantId), asc(usageEvents.agentId), asc(bucketTs));

                const grouped = new Map<string, { scope: ScopeKey; points: SpendPoint[] }>();
                for (const row of rows) {
                    const scope: ScopeKey = {
                        workspaceId,
                        tenantId: row.tenantId,
                        agentId: row.agentId,
                    };
                    const key = scopeKey(scope);
                    const entry = grouped.get(key) ?? { scope, points: [] };
                    entry.points.push({
                        ts: row.bucketTs instanceof Date ? row.bucketTs : new Date(row.bucketTs),
                        costUsd: Number.parseFloat(row.costUsd ?? "0"),
                    });
                    grouped.set(key, entry);
                }
                for (const { scope, points } of grouped.values()) {
                    out.push({ scope, points });
                }
            }

            const last = workspaceRows[workspaceRows.length - 1];
            if (last === undefined || workspaceRows.length < WORKSPACE_BATCH) break;
            cursor = last.id;
        }

        return out;
    },
});

const scopeKey = (scope: ScopeKey): string =>
    `${scope.workspaceId}|${scope.tenantId ?? ""}|${scope.agentId ?? ""}`;
