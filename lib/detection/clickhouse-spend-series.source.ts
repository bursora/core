/**
 * ClickHouse implementation of the SpendSeriesSource port.
 *
 * Aggregates `usage_events.cost_usd` per (workspace_id, tenant_id, agent_id)
 * scope into 5-minute buckets since `since`, for `status = 'ok'` rows only.
 * Buckets without events are NOT returned — the detector treats absent buckets
 * as "no signal" rather than zero spend, which avoids false flat lines for
 * low-traffic agents.
 *
 * Scopes come back ordered by (workspace_id, tenant_id, agent_id) with absent
 * (empty-string) tenant/agent sorting last, matching the Postgres adapter's
 * NULLS LAST ordering; points inside each scope are ordered by ts ascending.
 * Absent tenant/agent map back to null so the shape is identical to PG.
 *
 * ClickHouse aggregates server-side, so the whole result is one grouped query.
 * The PG adapter paged through workspaces to bound process memory because it
 * counted in Node; here only the aggregated buckets cross the wire.
 */

import "server-only";

import type { ClickHouse } from "@/lib/clickhouse/client";
import { tagOrNull } from "@/lib/clickhouse/decode";
import type { SpendPoint } from "./detect-anomaly";
import type { ScopedSpendSeries, ScopeKey, SpendSeriesSource } from "./spend-series-source";

const BUCKET_MS = 5 * 60 * 1000;

interface SpendBucketRow {
    readonly workspaceId: string;
    readonly tenantId: string;
    readonly agentId: string;
    /** Bucket start as epoch ms (Int64 → JSON string). */
    readonly bucketMs: string;
    /** Decimal sum → JSON string. */
    readonly costUsd: string;
}

export function clickHouseSpendSeriesSource(ch: ClickHouse): SpendSeriesSource {
    return {
        listScopedSeries: async (since: Date): Promise<readonly ScopedSpendSeries[]> => {
            const rows = await ch.query<SpendBucketRow>({
                query: `
                    SELECT
                        toString(workspace_id) AS workspaceId,
                        tenant_id AS tenantId,
                        agent_id AS agentId,
                        intDiv(toUnixTimestamp64Milli(ts), {bucketMs:Int64}) * {bucketMs:Int64} AS bucketMs,
                        sum(cost_usd) AS costUsd
                    FROM usage_events
                    WHERE status = 'ok'
                        AND ts >= fromUnixTimestamp64Milli({sinceMs:Int64})
                    GROUP BY workspaceId, tenantId, agentId, bucketMs
                    ORDER BY
                        workspaceId,
                        tenantId = '',
                        tenantId,
                        agentId = '',
                        agentId,
                        bucketMs
                `,
                query_params: { sinceMs: since.getTime(), bucketMs: BUCKET_MS },
            });

            const out: ScopedSpendSeries[] = [];
            const grouped = new Map<string, { scope: ScopeKey; points: SpendPoint[] }>();
            for (const row of rows) {
                const scope: ScopeKey = {
                    workspaceId: row.workspaceId,
                    tenantId: tagOrNull(row.tenantId),
                    agentId: tagOrNull(row.agentId),
                };
                const key = scopeKey(scope);
                let entry = grouped.get(key);
                if (entry === undefined) {
                    entry = { scope, points: [] };
                    grouped.set(key, entry);
                    out.push(entry);
                }
                entry.points.push({
                    ts: new Date(Number(row.bucketMs)),
                    costUsd: Number.parseFloat(row.costUsd ?? "0"),
                });
            }
            return out;
        },
    };
}

const scopeKey = (scope: ScopeKey): string =>
    `${scope.workspaceId}|${scope.tenantId ?? ""}|${scope.agentId ?? ""}`;
