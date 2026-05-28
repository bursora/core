// Bucket alignment uses epoch-floor (`to_timestamp(floor(extract(epoch from
// ts) / N) * N)`) for portability across session timezones — `date_trunc`
// truncates in the session TZ and would diverge from the in-memory fake.

import "server-only";

import type { Db } from "@/lib/db";
import { usageEvents } from "@/lib/db/schema";
import { drizzleSpendRepository } from "@/lib/spend";
import { and, count, desc, eq, gte, isNotNull, lt, max, or, sql, sum } from "drizzle-orm";
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
import type { Facet, SeriesPoint } from "./spend-series";
import { buildMeteringWhereClause } from "./usage-events-filters";

const DAY_MS = 24 * 60 * 60 * 1000;

type ScopeColumn =
    | typeof usageEvents.tenantId
    | typeof usageEvents.agentId
    | typeof usageEvents.workflowId
    | typeof usageEvents.provider
    | typeof usageEvents.model;

type FacetColumn = Exclude<ScopeColumn, typeof usageEvents.provider>;

const scopeColumn = (scope: ScopeKind): ScopeColumn => {
    switch (scope) {
        case "tenant":
            return usageEvents.tenantId;
        case "agent":
            return usageEvents.agentId;
        case "workflow":
            return usageEvents.workflowId;
        case "provider":
            return usageEvents.provider;
        case "model":
            return usageEvents.model;
    }
};

const facetColumn = (facet: Facet): FacetColumn => {
    switch (facet) {
        case "tenant":
            return usageEvents.tenantId;
        case "agent":
            return usageEvents.agentId;
        case "workflow":
            return usageEvents.workflowId;
        case "model":
            return usageEvents.model;
    }
};

const scopeFilter = (col: ScopeColumn, scopeId: string | undefined) =>
    scopeId !== undefined ? eq(col, scopeId) : undefined;

export const drizzleMeteringReadRepository = (db: Db): MeteringReadRepository => {
    const spend = drizzleSpendRepository(db);
    return {
        spendSeries: (query: SpendSeriesQuery): Promise<readonly SeriesPoint[]> =>
            // Status defaults to 'ok' here — dashboards show real spend, not
            // denied calls.
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
            // `blockedCount` is always a conditional aggregate so it stays
            // reachable regardless of the query's `status` filter. `cost` and
            // `callCount` use a matching conditional aggregate for 'ok' / 'blocked'
            // and unconditional aggregates for 'both'. Dropping the row-level
            // status predicate from the WHERE clause is what makes this work: with
            // the predicate, the FILTER would run against rows already excluded by
            // status, so a `status='ok'` query would always report blockedCount=0.
            const effective = query.status ?? "ok";
            const cost =
                effective === "both"
                    ? sum(usageEvents.costUsd)
                    : sql<string>`sum(${usageEvents.costUsd}) filter (where ${usageEvents.status} = ${effective})`;
            const callCount =
                effective === "both"
                    ? count()
                    : sql<number>`count(*) filter (where ${usageEvents.status} = ${effective})`;
            const blockedCount = sql<number>`count(*) filter (where ${usageEvents.status} = 'blocked')`;

            const rows = await db
                .select({ tag: tagCol, cost, callCount, blockedCount })
                .from(usageEvents)
                .where(
                    and(
                        // Pass `status: 'both'` to the builder so it does NOT add a
                        // row-level status predicate; status is applied via the
                        // FILTER aggregates above so `blockedCount` stays
                        // reachable alongside `callCount`/`cost`.
                        ...buildMeteringWhereClause({
                            workspaceId: query.workspaceId,
                            status: "both",
                            filters: query,
                        }),
                        gte(usageEvents.ts, query.windowStart),
                        lt(usageEvents.ts, query.windowEnd),
                        scopeFilter(tagCol, query.scopeId),
                    ),
                )
                .groupBy(tagCol)
                // Drop tags with no rows matching the status filter — "top
                // spenders" excludes tags whose only activity is denied calls when
                // querying 'ok' (and vice versa). For 'both', everything is fair
                // game and the HAVING short-circuits to true.
                .having(
                    effective === "both"
                        ? sql`true`
                        : sql`count(*) filter (where ${usageEvents.status} = ${effective}) > 0`,
                )
                .orderBy(desc(cost))
                .limit(query.limit);

            return rows.map((r) => ({
                tag: r.tag,
                costUsd: padCost(r.cost ?? "0"),
                callCount: safeCount(r.callCount),
                blockedCount: safeCount(r.blockedCount),
            }));
        },

        listDistinctValuesBulk: async (
            query: ListDistinctValuesBulkQuery,
        ): Promise<DistinctValuesByScope> => {
            if (query.scopes.length === 0) return {};
            const since = new Date(query.now.getTime() - query.sinceDays * 24 * 60 * 60 * 1000);

            // Status defaults to 'ok' — pill values are derived from real spend.
            // MeteringFilters are intentionally NOT passed: pill values come from
            // the raw scope universe in the lookback window, independent of
            // whatever filters the user has currently selected.
            const baseConditions = buildMeteringWhereClause({
                workspaceId: query.workspaceId,
                status: query.status ?? "ok",
            });

            const results = await Promise.all(
                query.scopes.map(async (scope) => {
                    const col = scopeColumn(scope);
                    const rows = await db
                        .select({ v: col, c: count() })
                        .from(usageEvents)
                        .where(and(...baseConditions, gte(usageEvents.ts, since), isNotNull(col)))
                        .groupBy(col)
                        .orderBy(desc(count()))
                        .limit(query.limit);
                    const values: DistinctValueWithCount[] = rows.flatMap((r) =>
                        r.v === null ? [] : [{ value: r.v as string, count: safeCount(r.c) }],
                    );
                    return [scope, values] as const;
                }),
            );

            return Object.fromEntries(results) as DistinctValuesByScope;
        },

        countEvents: async (query: CountEventsQuery): Promise<number> => {
            // Status defaults to 'ok' — workspace counters track real call volume.
            const conditions = and(
                ...buildMeteringWhereClause({
                    workspaceId: query.workspaceId,
                    status: query.status ?? "ok",
                    filters: query,
                }),
                query.since !== undefined ? gte(usageEvents.ts, query.since) : undefined,
            );

            const [row] = await db.select({ count: count() }).from(usageEvents).where(conditions);
            return row?.count ?? 0;
        },

        getLastUsageEventAt: async (query: LastUsageEventAtQuery): Promise<Date | null> => {
            // Hardcoded 'ok' — the dashboard's "last activity" stat tracks real
            // calls; a workspace whose only recent traffic is denied doesn't
            // count as active.
            const [row] = await db
                .select({ latest: max(usageEvents.ts) })
                .from(usageEvents)
                .where(
                    and(
                        ...buildMeteringWhereClause({
                            workspaceId: query.workspaceId,
                            status: "ok",
                        }),
                    ),
                );
            const latest = row?.latest ?? null;
            if (latest === null) return null;
            return latest instanceof Date ? latest : new Date(latest);
        },

        listBlockedEventsForBudget: async (
            query: BlockedEventsForBudgetQuery,
        ): Promise<BlockedEventsPage> => {
            // Hardcoded 'blocked' — the Blocks tab exists to list denials.
            const conditions = [
                ...buildMeteringWhereClause({
                    workspaceId: query.workspaceId,
                    status: "blocked",
                }),
                eq(usageEvents.decidedByBudgetId, query.budgetId),
                gte(usageEvents.ts, query.from),
                lt(usageEvents.ts, query.to),
            ];
            const decoded = decodeBlockedEventsCursor(query.cursor);
            if (decoded !== null) {
                // Compound cursor: strict less-than on `(ts, id)` under the page
                // order `(ts DESC, id DESC)`. Without the id tiebreaker, a burst
                // of denials that share a millisecond would silently lose rows at
                // the page boundary.
                const cursorTs = new Date(decoded.ts);
                const cursorCond = or(
                    lt(usageEvents.ts, cursorTs),
                    and(eq(usageEvents.ts, cursorTs), lt(usageEvents.id, decoded.id)),
                );
                if (cursorCond !== undefined) conditions.push(cursorCond);
            }

            const rows = await db
                .select({
                    id: usageEvents.id,
                    ts: usageEvents.ts,
                    tenantId: usageEvents.tenantId,
                    agentId: usageEvents.agentId,
                    workflowId: usageEvents.workflowId,
                    intendedProvider: usageEvents.provider,
                    intendedModel: usageEvents.model,
                    blockReason: usageEvents.blockReason,
                })
                .from(usageEvents)
                .where(and(...conditions))
                .orderBy(desc(usageEvents.ts), desc(usageEvents.id))
                .limit(query.limit + 1);

            const hasMore = rows.length > query.limit;
            const page = hasMore ? rows.slice(0, query.limit) : rows;
            const last = hasMore ? page[page.length - 1] : undefined;
            return {
                items: page.map((r) => ({
                    ts: (r.ts instanceof Date ? r.ts : new Date(r.ts)).toISOString(),
                    tenantId: r.tenantId,
                    agentId: r.agentId,
                    workflowId: r.workflowId,
                    intendedProvider: r.intendedProvider,
                    intendedModel: r.intendedModel,
                    blockReason: r.blockReason,
                })),
                nextCursor: last
                    ? encodeBlockedEventsCursor({
                          ts: (last.ts instanceof Date ? last.ts : new Date(last.ts)).toISOString(),
                          id: last.id,
                      })
                    : null,
            };
        },

        countBlockedEventsForBudget: async (
            query: CountBlockedEventsForBudgetQuery,
        ): Promise<number> => {
            // Hardcoded 'blocked' — pairs with `listBlockedEventsForBudget`.
            const [row] = await db
                .select({ count: count() })
                .from(usageEvents)
                .where(
                    and(
                        ...buildMeteringWhereClause({
                            workspaceId: query.workspaceId,
                            status: "blocked",
                        }),
                        eq(usageEvents.decidedByBudgetId, query.budgetId),
                        gte(usageEvents.ts, query.from),
                        lt(usageEvents.ts, query.to),
                    ),
                );
            return row?.count ?? 0;
        },

        cumulativeSpendDaily: async (
            query: CumulativeSpendDailyQuery,
        ): Promise<readonly number[]> => {
            const fromMs = query.from.getTime();
            const toMs = query.to.getTime();
            const span = toMs - fromMs;
            if (!Number.isFinite(span) || span <= 0) return [];

            const dayCount = Math.max(1, Math.ceil(span / DAY_MS));

            // Hardcoded 'ok' — sparkline on a budget detail page tracks real
            // spend against the cap; denied calls are tracked separately on the
            // Blocks tab.
            const filters = [
                ...buildMeteringWhereClause({
                    workspaceId: query.workspaceId,
                    status: "ok",
                }),
                gte(usageEvents.ts, query.from),
                lt(usageEvents.ts, query.to),
            ];
            if (query.scopeType === "tenant" && query.scopeId !== null) {
                filters.push(eq(usageEvents.tenantId, query.scopeId));
            } else if (query.scopeType === "agent" && query.scopeId !== null) {
                filters.push(eq(usageEvents.agentId, query.scopeId));
            } else if (query.scopeType === "workflow" && query.scopeId !== null) {
                filters.push(eq(usageEvents.workflowId, query.scopeId));
            }

            // Group by UTC day via epoch-floor — matches the fake's
            // `floor(ts / 86400000)` and the `spendSeries` query above. Avoids
            // `date_trunc('day', ts)` which truncates in the session timezone.
            const bucket = sql<
                Date | string
            >`to_timestamp(floor(extract(epoch from ${usageEvents.ts}) / 86400) * 86400)`;
            const rows = await db
                .select({ bucket, cost: sum(usageEvents.costUsd) })
                .from(usageEvents)
                .where(and(...filters))
                .groupBy(sql`1`)
                .orderBy(sql`1 asc`);

            const perDay = new Array<number>(dayCount).fill(0);
            for (const r of rows) {
                const ts =
                    r.bucket instanceof Date ? r.bucket.getTime() : new Date(r.bucket).getTime();
                const idx = Math.floor((ts - fromMs) / DAY_MS);
                if (idx < 0 || idx >= dayCount) continue;
                const parsed = Number.parseFloat(r.cost ?? "0");
                if (Number.isFinite(parsed)) perDay[idx] = (perDay[idx] ?? 0) + parsed;
            }

            let running = 0;
            return perDay.map((d) => (running += d));
        },
    };
};

/**
 * Coerce a `count(*)` result to a finite non-negative integer. Drizzle types
 * `count()` as `number`, but Postgres drivers can return strings or bigints
 * depending on configuration. Falling back to 0 keeps the UI safe.
 */
const safeCount = (n: number | string | bigint | null | undefined): number => {
    if (n === null || n === undefined) return 0;
    const v = typeof n === "number" ? n : Number(n);
    return Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0;
};

/**
 * Postgres `numeric` returns the canonical string form which may have fewer
 * trailing zeros than the column's scale. Pad to 8 fractional digits so the
 * shape matches the in-memory fake and the UI gets a consistent format.
 */
const padCost = (s: string): string => {
    if (s.includes(".")) {
        const [whole, frac] = s.split(".");
        return `${whole}.${(frac ?? "").padEnd(8, "0").slice(0, 8)}`;
    }
    return `${s}.00000000`;
};
