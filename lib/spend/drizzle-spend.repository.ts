/**
 * Drizzle SpendRepository — direct SUM(cost_usd) against `usage_events`.
 *
 * The single source of truth for spend aggregation. Both budgeting and the
 * metering dashboards delegate here so the WHERE clause (workspace + filters
 * + status + window) stays in lockstep.
 *
 * Bucket alignment for series uses epoch-floor (`to_timestamp(floor(extract
 * (epoch from ts) / N) * N)`) for portability across session timezones —
 * `date_trunc` truncates in the session TZ and would diverge from the
 * in-memory fake.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import type { Facet, SeriesPoint } from "@/lib/metering/spend-series";
import { UNTAGGED } from "@/lib/metering/spend-series";
import { buildMeteringWhereClause } from "@/lib/metering/usage-events-filters";
import { and, count, eq, gte, lt, sql, sum } from "drizzle-orm";
import type { GetSpendForScopeInput, GetSpendSeriesInput, SpendRepository } from "./repository";

type FacetColumn =
    | typeof schema.usageEvents.tenantId
    | typeof schema.usageEvents.agentId
    | typeof schema.usageEvents.workflowId
    | typeof schema.usageEvents.model;

const facetColumn = (facet: Facet): FacetColumn => {
    switch (facet) {
        case "tenant":
            return schema.usageEvents.tenantId;
        case "agent":
            return schema.usageEvents.agentId;
        case "workflow":
            return schema.usageEvents.workflowId;
        case "model":
            return schema.usageEvents.model;
    }
};

const parseTotal = (raw: string | null): number => {
    if (raw === null) return 0;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
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

export const drizzleSpendRepository = (db: Db): SpendRepository => ({
    getSpendForScope: async (input: GetSpendForScopeInput): Promise<number> => {
        const filters = [
            ...buildMeteringWhereClause({
                workspaceId: input.workspaceId,
                status: input.status,
                ...(input.filters !== undefined ? { filters: input.filters } : {}),
            }),
            gte(schema.usageEvents.ts, input.from),
            lt(schema.usageEvents.ts, input.to),
        ];

        if (input.scopeType === "tenant" && input.scopeId !== null) {
            filters.push(eq(schema.usageEvents.tenantId, input.scopeId));
        } else if (input.scopeType === "agent" && input.scopeId !== null) {
            filters.push(eq(schema.usageEvents.agentId, input.scopeId));
        } else if (input.scopeType === "workflow" && input.scopeId !== null) {
            filters.push(eq(schema.usageEvents.workflowId, input.scopeId));
        }

        const [row] = await db
            .select({ total: sum(schema.usageEvents.costUsd) })
            .from(schema.usageEvents)
            .where(and(...filters));

        return parseTotal(row?.total ?? null);
    },

    getSpendSeries: async (input: GetSpendSeriesInput): Promise<readonly SeriesPoint[]> => {
        const tagCol = facetColumn(input.facet);
        const bucket = sql<
            Date | string
        >`to_timestamp(floor(extract(epoch from ${schema.usageEvents.ts}) / ${input.bucketSeconds}) * ${input.bucketSeconds})`;

        const conditions = [
            ...buildMeteringWhereClause({
                workspaceId: input.workspaceId,
                status: input.status,
                ...(input.filters !== undefined ? { filters: input.filters } : {}),
            }),
            gte(schema.usageEvents.ts, input.windowStart),
            lt(schema.usageEvents.ts, input.windowEnd),
        ];
        if (input.scopeId !== undefined) {
            conditions.push(eq(tagCol, input.scopeId));
        }

        const rows = await db
            .select({
                bucket,
                tag: tagCol,
                cost: sum(schema.usageEvents.costUsd),
                callCount: count(),
            })
            .from(schema.usageEvents)
            .where(and(...conditions))
            .groupBy(sql`1`, tagCol)
            .orderBy(sql`1 asc`, sql`${tagCol} ASC NULLS FIRST`);

        return rows.map((r) => ({
            bucket: r.bucket instanceof Date ? r.bucket : new Date(r.bucket),
            tag: r.tag === null ? UNTAGGED : r.tag,
            costUsd: padCost(r.cost ?? "0"),
            callCount: safeCount(r.callCount),
        }));
    },
});
