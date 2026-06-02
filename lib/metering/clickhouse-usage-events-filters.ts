/**
 * Shared ClickHouse WHERE-clause builder for `usage_events` reads. Every CH
 * read site composes its predicate set here so workspace + status +
 * `MeteringFilters` stay in lock-step across the spend and metering-read
 * adapters.
 *
 * Returns parameterized condition fragments plus the matching `query_params`
 * object — never interpolated values — so the native client binds them safely.
 * The time window, scope-column equality, cursor, and `decided_by_budget_id`
 * predicates vary per query and stay at the call site.
 *
 * Facets are stored as the empty string when a tag is absent (the table keeps
 * them non-Nullable), so an `IN` filter naturally excludes untagged rows —
 * matching the PG `IN (...)` behavior against NULLs.
 */

import "server-only";

import type { MeteringFilters, MeteringStatusFilter } from "./metering-read.repository";

export interface ClickHouseWhere {
    readonly conditions: string[];
    readonly params: Record<string, unknown>;
}

const FACET_COLUMNS: Readonly<Record<keyof MeteringFilters, string>> = {
    provider: "provider",
    tenantId: "tenant_id",
    agentId: "agent_id",
    workflowId: "workflow_id",
    model: "model",
};

export interface BuildClickHouseMeteringWhereInput {
    readonly workspaceId: string;
    readonly status: MeteringStatusFilter;
    readonly filters?: MeteringFilters;
}

export function buildClickHouseMeteringWhere(
    input: BuildClickHouseMeteringWhereInput,
): ClickHouseWhere {
    const conditions = ["workspace_id = {workspaceId:UUID}"];
    const params: Record<string, unknown> = { workspaceId: input.workspaceId };

    if (input.status === "both") {
        // 'both' means the two budget outcomes the spend UI exposes — ok and
        // blocked — never `status='errored'` failures, which are not spend.
        conditions.push("status IN ('ok', 'blocked')");
    } else {
        conditions.push("status = {status:String}");
        params.status = input.status;
    }

    if (input.filters !== undefined) {
        for (const key of Object.keys(FACET_COLUMNS) as (keyof MeteringFilters)[]) {
            const values = input.filters[key];
            if (values !== undefined && values.length > 0) {
                const param = `filter_${key}`;
                conditions.push(`${FACET_COLUMNS[key]} IN {${param}:Array(String)}`);
                params[param] = values;
            }
        }
    }

    return { conditions, params };
}
