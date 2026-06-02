/**
 * ClickHouse SpendRepository — direct SUM(cost_usd) against `usage_events`.
 *
 * The sole `SpendRepository` implementation: the dashboard and budgeting read
 * paths wire it through `lib/spend` without touching the use-cases.
 *
 * Money stays a string end-to-end: `cost_usd` is `Decimal(22,8)` and CH
 * serializes a decimal sum as a bare JSON number, so the query wraps it in
 * `toString()` to keep full precision over the wire, then `padCost` normalizes
 * to 8 fractional digits to match the PG `numeric` canonical form.
 *
 * Bucket alignment uses epoch-millisecond floor (`intDiv(toUnixTimestamp64Milli
 * (ts), N) * N`) — the exact analog of the PG epoch-floor bucketing, independent
 * of any session timezone.
 *
 * Absent facet tags are the empty string in CH (the table keeps them
 * non-Nullable); the series maps `''` back to the `UNTAGGED` literal.
 */

import "server-only";

import type { ClickHouse } from "@/lib/clickhouse/client";
import { buildClickHouseMeteringWhere } from "@/lib/metering/clickhouse-usage-events-filters";
import type { Facet, SeriesPoint } from "@/lib/metering/spend-series";
import { UNTAGGED } from "@/lib/metering/spend-series";
import type { GetSpendForScopeInput, GetSpendSeriesInput, SpendRepository } from "./repository";

const TABLE = "usage_events";

const facetColumn = (facet: Facet): string => {
    switch (facet) {
        case "tenant":
            return "tenant_id";
        case "agent":
            return "agent_id";
        case "workflow":
            return "workflow_id";
        case "model":
            return "model";
    }
};

interface SpendForScopeRow {
    total: string | null;
}

interface SpendSeriesRow {
    bucket_ms: string;
    tag: string;
    cost: string | null;
    call_count: string;
}

export const clickHouseSpendRepository = (ch: ClickHouse): SpendRepository => ({
    getSpendForScope: async (input: GetSpendForScopeInput): Promise<number> => {
        const { conditions, params } = buildClickHouseMeteringWhere({
            workspaceId: input.workspaceId,
            status: input.status,
            ...(input.filters !== undefined ? { filters: input.filters } : {}),
        });
        conditions.push(
            "toUnixTimestamp64Milli(ts) >= {fromMs:Int64}",
            "toUnixTimestamp64Milli(ts) < {toMs:Int64}",
        );
        params.fromMs = input.from.getTime();
        params.toMs = input.to.getTime();
        pushScopeFilter(conditions, params, input.scopeType, input.scopeId);

        const rows = await ch.query<SpendForScopeRow>({
            query: `SELECT toString(sum(cost_usd)) AS total FROM ${TABLE} WHERE ${conditions.join(" AND ")}`,
            query_params: params,
        });
        return parseTotal(rows[0]?.total ?? null);
    },

    getSpendSeries: async (input: GetSpendSeriesInput): Promise<readonly SeriesPoint[]> => {
        const tagCol = facetColumn(input.facet);
        const { conditions, params } = buildClickHouseMeteringWhere({
            workspaceId: input.workspaceId,
            status: input.status,
            ...(input.filters !== undefined ? { filters: input.filters } : {}),
        });
        conditions.push(
            "toUnixTimestamp64Milli(ts) >= {windowStartMs:Int64}",
            "toUnixTimestamp64Milli(ts) < {windowEndMs:Int64}",
        );
        params.windowStartMs = input.windowStart.getTime();
        params.windowEndMs = input.windowEnd.getTime();
        params.bucketMs = input.bucketSeconds * 1000;
        if (input.scopeId !== undefined) {
            conditions.push(`${tagCol} = {scopeId:String}`);
            params.scopeId = input.scopeId;
        }

        const rows = await ch.query<SpendSeriesRow>({
            query: `SELECT
                    intDiv(toUnixTimestamp64Milli(ts), {bucketMs:Int64}) * {bucketMs:Int64} AS bucket_ms,
                    ${tagCol} AS tag,
                    toString(sum(cost_usd)) AS cost,
                    count() AS call_count
                FROM ${TABLE}
                WHERE ${conditions.join(" AND ")}
                GROUP BY bucket_ms, tag
                ORDER BY bucket_ms ASC, tag ASC`,
            query_params: params,
        });

        return rows.map((r) => ({
            bucket: new Date(Number(r.bucket_ms)),
            tag: r.tag === "" ? UNTAGGED : r.tag,
            costUsd: padCost(r.cost ?? "0"),
            callCount: safeCount(r.call_count),
        }));
    },
});

/**
 * Restrict an aggregate to a single tenant/agent/workflow value. `workspace`
 * scope and a `null` id skip the predicate, mirroring the PG repo.
 */
function pushScopeFilter(
    conditions: string[],
    params: Record<string, unknown>,
    scopeType: GetSpendForScopeInput["scopeType"],
    scopeId: string | null,
): void {
    if (scopeId === null) return;
    if (scopeType === "tenant") {
        conditions.push("tenant_id = {scopeId:String}");
    } else if (scopeType === "agent") {
        conditions.push("agent_id = {scopeId:String}");
    } else if (scopeType === "workflow") {
        conditions.push("workflow_id = {scopeId:String}");
    } else {
        return;
    }
    params.scopeId = scopeId;
}

/** Parse a `toString(sum(...))` total to a finite number; null/`NaN` → 0. */
function parseTotal(raw: string | null): number {
    if (raw === null) return 0;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Coerce a CH `count()` (returned as a JSON string) to a finite non-negative
 * integer. Falling back to 0 keeps the UI safe.
 */
function safeCount(n: number | string | bigint | null | undefined): number {
    if (n === null || n === undefined) return 0;
    const v = typeof n === "number" ? n : Number(n);
    return Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0;
}

/**
 * `toString()` on a CH decimal drops trailing zeros to the canonical form.
 * Pad to 8 fractional digits so the shape matches the PG repo and the UI gets a
 * consistent format.
 */
function padCost(s: string): string {
    if (s.includes(".")) {
        const [whole, frac] = s.split(".");
        return `${whole}.${(frac ?? "").padEnd(8, "0").slice(0, 8)}`;
    }
    return `${s}.00000000`;
}
