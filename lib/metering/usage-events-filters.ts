/**
 * Shared drizzle predicate builder for cross-cutting MeteringFilters on
 * usage_events. Both the metering read repository and the dashboard stats
 * production deps use this so filter semantics stay consistent.
 */

import { usageEvents } from "@/lib/db";
import { inArray, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { MeteringFilters } from "./metering-read.repository";

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
