/**
 * Shared drizzle predicate builder for `usage_events` WHERE clauses. Every
 * read site that filters by workspace and the cross-cutting `MeteringFilters`
 * dimensions (provider, tenantId, agentId, workflowId, model) calls
 * `buildMeteringWhereClause` so the predicate set stays in lock-step. The
 * status filter is REQUIRED to force each caller to pick one explicitly —
 * dropping the implicit default removes the drift that used to vary across
 * sites.
 */

import { usageEvents } from "@/lib/db/schema";
import { eq, inArray, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { MeteringFilters, MeteringStatusFilter } from "./metering-read.repository";

const inFilter = (col: PgColumn, values: readonly string[] | undefined): SQL | undefined => {
    if (values === undefined || values.length === 0) return undefined;
    return inArray(col, values as string[]);
};

export function usageEventsFilterConditions(
    filters: MeteringFilters | undefined,
): readonly (SQL | undefined)[] {
    if (filters === undefined) return [];
    return [
        inFilter(usageEvents.provider, filters.provider),
        inFilter(usageEvents.tenantId, filters.tenantId),
        inFilter(usageEvents.agentId, filters.agentId),
        inFilter(usageEvents.workflowId, filters.workflowId),
        inFilter(usageEvents.model, filters.model),
    ];
}

export interface BuildMeteringWhereClauseInput {
    readonly workspaceId: string;
    readonly filters?: MeteringFilters;
    /**
     * Required — each caller picks the status it wants. `'ok'` is the
     * historical default for read-side aggregates; `'blocked'` is for the
     * Blocks tab; `'both'` omits the status predicate entirely. Making this
     * required removes the implicit-default drift that used to exist across
     * call sites.
     */
    readonly status: MeteringStatusFilter;
}

/**
 * Single-source-of-truth WHERE-clause builder for `usage_events` reads.
 * Returns the array of Drizzle SQL predicates the caller composes with
 * `and(...)`. Excludes the time window, scope-column equality, cursor, and
 * `decided_by_budget_id` predicates — those vary per query and stay at the
 * call site.
 */
export function buildMeteringWhereClause(input: BuildMeteringWhereClauseInput): SQL[] {
    const conditions: SQL[] = [eq(usageEvents.workspaceId, input.workspaceId)];
    if (input.status !== "both") {
        conditions.push(eq(usageEvents.status, input.status));
    }
    for (const cond of usageEventsFilterConditions(input.filters)) {
        if (cond !== undefined) conditions.push(cond);
    }
    return conditions;
}
