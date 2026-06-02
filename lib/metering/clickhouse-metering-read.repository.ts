/**
 * ClickHouse implementation of `MeteringReadRepository` — the sole metering
 * read path behind the dashboard use-cases.
 *
 * Representation notes (the CH column model):
 * - Facets are the empty string when a tag is absent; the read side maps `''`
 *   back to `null` / `(untagged)` so projections match PG's nullable columns.
 * - `cost_usd` is `Decimal(22,8)`; sums are wrapped in `toString()` (CH would
 *   otherwise emit a bare JSON number) and normalized with `padCost`.
 * - Time math uses epoch milliseconds (`toUnixTimestamp64Milli`) so bucket
 *   floors and window bounds match the PG epoch-floor exactly, timezone-free.
 * - `id` ordering and the `(ts, id)` cursor use `toString(id)`: CH's native
 *   UUID comparison is byte-swapped and would diverge from PG's lexicographic
 *   uuid order.
 */

import "server-only";

import type { ClickHouse } from "@/lib/clickhouse/client";
import { padCost, safeCount, tagOrNull } from "@/lib/clickhouse/decode";
import { clickHouseSpendRepository } from "@/lib/spend";
import { facetColumn } from "@/lib/spend/clickhouse-spend.repository";
import { buildClickHouseMeteringWhere } from "./clickhouse-usage-events-filters";
import {
    decodeBlockedEventsCursor,
    encodeBlockedEventsCursor,
    type BlockedEventsForBudgetQuery,
    type BlockedEventsPage,
    type CountBlockedEventsForBudgetQuery,
    type CountEventsQuery,
    type CumulativeSpendDailyQuery,
    type DistinctValueWithCount,
    type DistinctValuesByScope,
    type LastUsageEventAtQuery,
    type ListDistinctValuesBulkQuery,
    type MeteringReadRepository,
    type ScopeKind,
    type SpendSeriesQuery,
    type TopSpenderRow,
    type TopSpendersQuery,
} from "./metering-read.repository";
import type { SeriesPoint } from "./spend-series";

const TABLE = "usage_events";
const DAY_MS = 24 * 60 * 60 * 1000;

const scopeColumn = (scope: ScopeKind): string => {
    switch (scope) {
        case "tenant":
            return "tenant_id";
        case "agent":
            return "agent_id";
        case "workflow":
            return "workflow_id";
        case "provider":
            return "provider";
        case "model":
            return "model";
    }
};

export const clickHouseMeteringReadRepository = (ch: ClickHouse): MeteringReadRepository => {
    const spend = clickHouseSpendRepository(ch);
    return {
        spendSeries: (query: SpendSeriesQuery): Promise<readonly SeriesPoint[]> =>
            spend.getSpendSeries({
                workspaceId: query.workspaceId,
                facet: query.facet,
                windowStart: query.windowStart,
                windowEnd: query.windowEnd,
                bucketSeconds: query.bucketSeconds,
                ...(query.scopeId !== undefined ? { scopeId: query.scopeId } : {}),
                status: query.status ?? "ok",
                filters: {
                    provider: query.provider,
                    tenantId: query.tenantId,
                    agentId: query.agentId,
                    workflowId: query.workflowId,
                    model: query.model,
                },
            }),

        topSpenders: async (query: TopSpendersQuery): Promise<readonly TopSpenderRow[]> => {
            const tagCol = facetColumn(query.facet);
            const effective = query.status ?? "ok";
            // Pass `status: 'both'` so the builder adds no row-level status
            // predicate; status is applied via conditional aggregates below so
            // `blockedCount` stays reachable alongside `callCount`/`cost`.
            const { conditions, params } = buildClickHouseMeteringWhere({
                workspaceId: query.workspaceId,
                status: "both",
                filters: query,
            });
            conditions.push(
                "toUnixTimestamp64Milli(ts) >= {windowStartMs:Int64}",
                "toUnixTimestamp64Milli(ts) < {windowEndMs:Int64}",
            );
            params.windowStartMs = query.windowStart.getTime();
            params.windowEndMs = query.windowEnd.getTime();
            params.limit = query.limit;
            if (query.scopeId !== undefined) {
                conditions.push(`${tagCol} = {scopeId:String}`);
                params.scopeId = query.scopeId;
            }

            const both = effective === "both";
            const costExpr = both
                ? "sum(cost_usd)"
                : "sumIf(cost_usd, status = {effective:String})";
            const callExpr = both ? "count()" : "countIf(status = {effective:String})";
            if (!both) params.effective = effective;
            // Drop tags with no rows matching the status filter — "top spenders"
            // excludes tags whose only activity is denied calls when querying
            // 'ok' (and vice versa). 'both' keeps everything.
            const having = both ? "" : `HAVING countIf(status = {effective:String}) > 0`;

            const rows = await ch.query<{
                tag: string;
                cost: string | null;
                call_count: string;
                blocked_count: string;
            }>({
                query: `SELECT
                        ${tagCol} AS tag,
                        toString(${costExpr}) AS cost,
                        ${callExpr} AS call_count,
                        countIf(status = 'blocked') AS blocked_count
                    FROM ${TABLE}
                    WHERE ${conditions.join(" AND ")}
                    GROUP BY tag
                    ${having}
                    ORDER BY ${costExpr} DESC
                    LIMIT {limit:UInt64}`,
                query_params: params,
            });

            return rows.map((r) => ({
                tag: tagOrNull(r.tag),
                costUsd: padCost(r.cost ?? "0"),
                callCount: safeCount(r.call_count),
                blockedCount: safeCount(r.blocked_count),
            }));
        },

        listDistinctValuesBulk: async (
            query: ListDistinctValuesBulkQuery,
        ): Promise<DistinctValuesByScope> => {
            if (query.scopes.length === 0) return {};
            const sinceMs = query.now.getTime() - query.sinceDays * DAY_MS;
            const status = query.status ?? "ok";

            // MeteringFilters are intentionally NOT passed: pill values come from
            // the raw scope universe in the lookback window, independent of the
            // user's currently-selected filters.
            const results = await Promise.all(
                query.scopes.map(async (scope) => {
                    const col = scopeColumn(scope);
                    const { conditions, params } = buildClickHouseMeteringWhere({
                        workspaceId: query.workspaceId,
                        status,
                    });
                    conditions.push(
                        "toUnixTimestamp64Milli(ts) >= {sinceMs:Int64}",
                        `${col} != ''`,
                    );
                    params.sinceMs = sinceMs;
                    params.limit = query.limit;

                    const rows = await ch.query<{ v: string; c: string }>({
                        query: `SELECT ${col} AS v, count() AS c
                            FROM ${TABLE}
                            WHERE ${conditions.join(" AND ")}
                            GROUP BY v
                            ORDER BY c DESC
                            LIMIT {limit:UInt64}`,
                        query_params: params,
                    });
                    const values: DistinctValueWithCount[] = rows.map((r) => ({
                        value: r.v,
                        count: safeCount(r.c),
                    }));
                    return [scope, values] as const;
                }),
            );

            return Object.fromEntries(results) as DistinctValuesByScope;
        },

        countEvents: async (query: CountEventsQuery): Promise<number> => {
            const { conditions, params } = buildClickHouseMeteringWhere({
                workspaceId: query.workspaceId,
                status: query.status ?? "ok",
                filters: query,
            });
            if (query.since !== undefined) {
                conditions.push("toUnixTimestamp64Milli(ts) >= {sinceMs:Int64}");
                params.sinceMs = query.since.getTime();
            }

            const rows = await ch.query<{ c: string }>({
                query: `SELECT count() AS c FROM ${TABLE} WHERE ${conditions.join(" AND ")}`,
                query_params: params,
            });
            return safeCount(rows[0]?.c);
        },

        getLastUsageEventAt: async (query: LastUsageEventAtQuery): Promise<Date | null> => {
            // Hardcoded 'ok' — "last activity" tracks real calls; a workspace
            // whose only recent traffic is denied doesn't count as active. CH
            // `max` over an empty set returns the zero datetime, so the row count
            // is what distinguishes "no events" from a real timestamp.
            const { conditions, params } = buildClickHouseMeteringWhere({
                workspaceId: query.workspaceId,
                status: "ok",
            });
            const rows = await ch.query<{ c: string; latest_ms: string }>({
                query: `SELECT count() AS c, toUnixTimestamp64Milli(max(ts)) AS latest_ms
                    FROM ${TABLE} WHERE ${conditions.join(" AND ")}`,
                query_params: params,
            });
            const row = rows[0];
            if (row === undefined || safeCount(row.c) === 0) return null;
            return new Date(Number(row.latest_ms));
        },

        listBlockedEventsForBudget: async (
            query: BlockedEventsForBudgetQuery,
        ): Promise<BlockedEventsPage> => {
            const { conditions, params } = buildClickHouseMeteringWhere({
                workspaceId: query.workspaceId,
                status: "blocked",
            });
            conditions.push(
                "decided_by_budget_id = {budgetId:UUID}",
                "toUnixTimestamp64Milli(ts) >= {fromMs:Int64}",
                "toUnixTimestamp64Milli(ts) < {toMs:Int64}",
            );
            params.budgetId = query.budgetId;
            params.fromMs = query.from.getTime();
            params.toMs = query.to.getTime();

            const decoded = decodeBlockedEventsCursor(query.cursor);
            if (decoded !== null) {
                // Compound cursor: strict less-than on `(ts, id)` under the page
                // order `(ts DESC, id DESC)`. The id tiebreak keeps a burst of
                // denials sharing a millisecond addressable across pages.
                conditions.push(
                    "(toUnixTimestamp64Milli(ts) < {cursorMs:Int64} OR (toUnixTimestamp64Milli(ts) = {cursorMs:Int64} AND toString(id) < {cursorId:String}))",
                );
                params.cursorMs = new Date(decoded.ts).getTime();
                params.cursorId = decoded.id;
            }
            params.limit = query.limit + 1;

            const rows = await ch.query<{
                id: string;
                ts_ms: string;
                tenant_id: string;
                agent_id: string;
                workflow_id: string;
                provider: string;
                model: string;
                block_reason: string | null;
            }>({
                query: `SELECT
                        toString(id) AS id,
                        toUnixTimestamp64Milli(ts) AS ts_ms,
                        tenant_id, agent_id, workflow_id, provider, model, block_reason
                    FROM ${TABLE}
                    WHERE ${conditions.join(" AND ")}
                    ORDER BY ts DESC, toString(id) DESC
                    LIMIT {limit:UInt64}`,
                query_params: params,
            });

            const hasMore = rows.length > query.limit;
            const page = hasMore ? rows.slice(0, query.limit) : rows;
            const last = hasMore ? page[page.length - 1] : undefined;
            return {
                items: page.map((r) => ({
                    ts: new Date(Number(r.ts_ms)).toISOString(),
                    tenantId: tagOrNull(r.tenant_id),
                    agentId: tagOrNull(r.agent_id),
                    workflowId: tagOrNull(r.workflow_id),
                    intendedProvider: tagOrNull(r.provider),
                    intendedModel: tagOrNull(r.model),
                    blockReason: r.block_reason,
                })),
                nextCursor: last
                    ? encodeBlockedEventsCursor({
                          ts: new Date(Number(last.ts_ms)).toISOString(),
                          id: last.id,
                      })
                    : null,
            };
        },

        countBlockedEventsForBudget: async (
            query: CountBlockedEventsForBudgetQuery,
        ): Promise<number> => {
            const { conditions, params } = buildClickHouseMeteringWhere({
                workspaceId: query.workspaceId,
                status: "blocked",
            });
            conditions.push(
                "decided_by_budget_id = {budgetId:UUID}",
                "toUnixTimestamp64Milli(ts) >= {fromMs:Int64}",
                "toUnixTimestamp64Milli(ts) < {toMs:Int64}",
            );
            params.budgetId = query.budgetId;
            params.fromMs = query.from.getTime();
            params.toMs = query.to.getTime();

            const rows = await ch.query<{ c: string }>({
                query: `SELECT count() AS c FROM ${TABLE} WHERE ${conditions.join(" AND ")}`,
                query_params: params,
            });
            return safeCount(rows[0]?.c);
        },

        cumulativeSpendDaily: async (
            query: CumulativeSpendDailyQuery,
        ): Promise<readonly number[]> => {
            const fromMs = query.from.getTime();
            const toMs = query.to.getTime();
            const span = toMs - fromMs;
            if (!Number.isFinite(span) || span <= 0) return [];

            const dayCount = Math.max(1, Math.ceil(span / DAY_MS));

            // Hardcoded 'ok' — the sparkline tracks real spend against the cap;
            // denied calls live on the Blocks tab.
            const { conditions, params } = buildClickHouseMeteringWhere({
                workspaceId: query.workspaceId,
                status: "ok",
            });
            conditions.push(
                "toUnixTimestamp64Milli(ts) >= {fromMs:Int64}",
                "toUnixTimestamp64Milli(ts) < {toMs:Int64}",
            );
            params.fromMs = fromMs;
            params.toMs = toMs;
            params.dayMs = DAY_MS;
            if (query.scopeType === "tenant" && query.scopeId !== null) {
                conditions.push("tenant_id = {scopeId:String}");
                params.scopeId = query.scopeId;
            } else if (query.scopeType === "agent" && query.scopeId !== null) {
                conditions.push("agent_id = {scopeId:String}");
                params.scopeId = query.scopeId;
            } else if (query.scopeType === "workflow" && query.scopeId !== null) {
                conditions.push("workflow_id = {scopeId:String}");
                params.scopeId = query.scopeId;
            }

            const rows = await ch.query<{ bucket_ms: string; cost: string | null }>({
                query: `SELECT
                        intDiv(toUnixTimestamp64Milli(ts), {dayMs:Int64}) * {dayMs:Int64} AS bucket_ms,
                        toString(sum(cost_usd)) AS cost
                    FROM ${TABLE}
                    WHERE ${conditions.join(" AND ")}
                    GROUP BY bucket_ms
                    ORDER BY bucket_ms ASC`,
                query_params: params,
            });

            const perDay = new Array<number>(dayCount).fill(0);
            for (const r of rows) {
                const idx = Math.floor((Number(r.bucket_ms) - fromMs) / DAY_MS);
                if (idx < 0 || idx >= dayCount) continue;
                const parsed = Number.parseFloat(r.cost ?? "0");
                if (Number.isFinite(parsed)) perDay[idx] = (perDay[idx] ?? 0) + parsed;
            }

            let running = 0;
            return perDay.map((d) => (running += d));
        },
    };
};
