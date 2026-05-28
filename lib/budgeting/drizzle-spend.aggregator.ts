/**
 * Drizzle SpendAggregator — adapter over the unified `SpendRepository`.
 *
 * The single-shot `getSpendForScopePeriod` delegates to
 * `SpendRepository.getSpendForScope` so the WHERE clause stays in lockstep
 * with the metering dashboards.
 *
 * `getSpendForScopePeriodBatch` keeps its own GROUP BY + IN-list query path
 * because it collapses N per-scope reads into one SQL per (period, scopeType).
 * The unified repo intentionally stays single-scope; batching is a budgeting-
 * specific optimization for the dashboard list.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { buildMeteringWhereClause } from "@/lib/metering/usage-events-filters";
import type { SpendRepository } from "@/lib/spend";
import { drizzleSpendRepository } from "@/lib/spend";
import { and, gte, inArray, lt, sum } from "drizzle-orm";
import type { ScopeType } from "./budget";
import type { SpendAggregator, SpendAggregatorQuery } from "./spend-aggregator";

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
    private readonly spend: SpendRepository;

    constructor(private readonly db: Db) {
        this.spend = drizzleSpendRepository(db);
    }

    async getSpendForScopePeriod(query: SpendAggregatorQuery): Promise<number> {
        // Hardcoded 'ok' — budgets only cap real spend; denied calls cost
        // nothing and would otherwise inflate the running total.
        return this.spend.getSpendForScope({
            workspaceId: query.workspaceId,
            scopeType: query.scopeType,
            scopeId: query.scopeId,
            from: query.from,
            to: query.to,
            status: "ok",
        });
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

        // Hardcoded 'ok' on both branches — matches the single-shot path
        // above; budgets cap real spend only.
        const workspaceJobs: Promise<void>[] = [];
        for (const { from, to, indices } of workspaceGroups.values()) {
            workspaceJobs.push(
                (async () => {
                    const [row] = await this.db
                        .select({ total: sum(schema.usageEvents.costUsd) })
                        .from(schema.usageEvents)
                        .where(
                            and(
                                ...buildMeteringWhereClause({
                                    workspaceId: query.workspaceId,
                                    status: "ok",
                                }),
                                gte(schema.usageEvents.ts, from),
                                lt(schema.usageEvents.ts, to),
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
                                ...buildMeteringWhereClause({
                                    workspaceId: query.workspaceId,
                                    status: "ok",
                                }),
                                gte(schema.usageEvents.ts, group.from),
                                lt(schema.usageEvents.ts, group.to),
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
