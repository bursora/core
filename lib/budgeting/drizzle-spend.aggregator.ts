/**
 * Drizzle SpendAggregator — direct SUM(cost_usd) against `usage_events`.
 *
 * Filters:
 *   - workspace_id (always)
 *   - ts >= from AND ts < to (the half-open window from `periodWindow`)
 *   - scope_type → matches the corresponding column:
 *       'workspace' → no extra filter (workspace_id alone scopes it)
 *       'tenant'    → tenant_id = scopeId
 *       'agent'     → agent_id = scopeId
 *       'workflow'  → workflow_id = scopeId
 *
 * Returns a USD float. The column is `numeric(14,8)` so the SUM comes back
 * as a decimal string from postgres-js; we parseFloat at the boundary. Sub-
 * cent precision is acceptable for budget evaluation (limits are in dollars).
 */

import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import type { ScopeType } from "./budget";
import type { SpendAggregator, SpendAggregatorQuery } from "./spend-aggregator";
import { and, eq, gte, inArray, lt, sum } from "drizzle-orm";

type NarrowedScopeType = Exclude<ScopeType, "workspace">;

const scopeColumn = (scopeType: NarrowedScopeType) => {
    switch (scopeType) {
        case "tenant":
            return schema.usageEvents.tenantId;
        case "agent":
            return schema.usageEvents.agentId;
        case "workflow":
            return schema.usageEvents.workflowId;
    }
};

const parseTotal = (raw: string | null): number => {
    if (raw === null) return 0;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
};

export class DrizzleSpendAggregator implements SpendAggregator {
    constructor(private readonly db: Db) {}

    async getSpendForScopePeriod(query: SpendAggregatorQuery): Promise<number> {
        const filters = [
            eq(schema.usageEvents.workspaceId, query.workspaceId),
            gte(schema.usageEvents.ts, query.from),
            lt(schema.usageEvents.ts, query.to),
            eq(schema.usageEvents.status, "ok"),
        ];

        if (query.scopeType === "tenant" && query.scopeId !== null) {
            filters.push(eq(schema.usageEvents.tenantId, query.scopeId));
        } else if (query.scopeType === "agent" && query.scopeId !== null) {
            filters.push(eq(schema.usageEvents.agentId, query.scopeId));
        } else if (query.scopeType === "workflow" && query.scopeId !== null) {
            filters.push(eq(schema.usageEvents.workflowId, query.scopeId));
        }

        const [row] = await this.db
            .select({ total: sum(schema.usageEvents.costUsd) })
            .from(schema.usageEvents)
            .where(and(...filters));

        return parseTotal(row?.total ?? null);
    }

    /**
     * Batched read for headroom-style panels. Items are grouped by
     * (from, to, scopeType, narrowed?); each group hits one SQL aggregating
     * with GROUP BY scope_column. Results are folded back to input order.
     */
    async getSpendForScopePeriodBatch(query: {
        readonly workspaceId: string;
        readonly items: readonly Omit<SpendAggregatorQuery, "workspaceId">[];
    }): Promise<readonly number[]> {
        const totals = new Array<number>(query.items.length).fill(0);
        if (query.items.length === 0) return totals;

        type WorkspaceKey = string;
        type NarrowedKey = string;
        const workspaceGroups = new Map<
            WorkspaceKey,
            { from: Date; to: Date; indices: number[] }
        >();
        const narrowedGroups = new Map<
            NarrowedKey,
            {
                from: Date;
                to: Date;
                scopeType: NarrowedScopeType;
                entries: { scopeId: string; index: number }[];
            }
        >();

        query.items.forEach((it, idx) => {
            const narrowedScope: NarrowedScopeType | null =
                it.scopeType === "tenant" || it.scopeType === "agent" || it.scopeType === "workflow"
                    ? it.scopeType
                    : null;
            if (narrowedScope === null || it.scopeId === null) {
                const key = `${it.from.toISOString()}|${it.to.toISOString()}`;
                const existing = workspaceGroups.get(key);
                if (existing) existing.indices.push(idx);
                else workspaceGroups.set(key, { from: it.from, to: it.to, indices: [idx] });
                return;
            }
            const key = `${it.from.toISOString()}|${it.to.toISOString()}|${narrowedScope}`;
            const existing = narrowedGroups.get(key);
            const entry = { scopeId: it.scopeId, index: idx };
            if (existing) existing.entries.push(entry);
            else
                narrowedGroups.set(key, {
                    from: it.from,
                    to: it.to,
                    scopeType: narrowedScope,
                    entries: [entry],
                });
        });

        const workspaceJobs: Promise<void>[] = [];
        for (const { from, to, indices } of workspaceGroups.values()) {
            workspaceJobs.push(
                (async () => {
                    const [row] = await this.db
                        .select({ total: sum(schema.usageEvents.costUsd) })
                        .from(schema.usageEvents)
                        .where(
                            and(
                                eq(schema.usageEvents.workspaceId, query.workspaceId),
                                gte(schema.usageEvents.ts, from),
                                lt(schema.usageEvents.ts, to),
                                eq(schema.usageEvents.status, "ok"),
                            ),
                        );
                    const total = parseTotal(row?.total ?? null);
                    for (const idx of indices) totals[idx] = total;
                })(),
            );
        }

        const narrowedJobs: Promise<void>[] = [];
        for (const group of narrowedGroups.values()) {
            const column = scopeColumn(group.scopeType);
            const scopeIds = Array.from(new Set(group.entries.map((e) => e.scopeId)));
            narrowedJobs.push(
                (async () => {
                    const rows = await this.db
                        .select({
                            scopeId: column,
                            total: sum(schema.usageEvents.costUsd),
                        })
                        .from(schema.usageEvents)
                        .where(
                            and(
                                eq(schema.usageEvents.workspaceId, query.workspaceId),
                                gte(schema.usageEvents.ts, group.from),
                                lt(schema.usageEvents.ts, group.to),
                                eq(schema.usageEvents.status, "ok"),
                                inArray(column, scopeIds),
                            ),
                        )
                        .groupBy(column);
                    const byScope = new Map<string, number>();
                    for (const r of rows) {
                        if (r.scopeId === null) continue;
                        byScope.set(r.scopeId, parseTotal(r.total));
                    }
                    for (const { scopeId, index } of group.entries) {
                        totals[index] = byScope.get(scopeId) ?? 0;
                    }
                })(),
            );
        }

        await Promise.all([...workspaceJobs, ...narrowedJobs]);
        return totals;
    }
}
