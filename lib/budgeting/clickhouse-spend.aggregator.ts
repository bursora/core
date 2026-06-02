/**
 * ClickHouseSpendAggregator — the SpendAggregator the budget preflight depends
 * on. Each call is a direct windowed `SUM(cost_usd)` over `usage_events` in
 * ClickHouse, the single source of truth for spend.
 *
 * ClickHouse is the canonical store and the read is exact: a `MergeTree`
 * ordered by `(workspace_id, ts)`, month-partition-pruned, sums a single
 * workspace's window in a few milliseconds — negligible next to the AI call
 * the check precedes, and never stale. Synchronous ingest inserts mean a
 * recorded event is summed by the very next preflight, so a runaway burst
 * trips the cap as the spend lands.
 *
 * The query carries the resolved `[from, to)` window; `decideBudget` computes
 * it from the budget's real period, so there is no window guessing here.
 */

import type { SpendRepository } from "@/lib/spend";
import type { SpendAggregator, SpendAggregatorQuery } from "./spend-aggregator";

export class ClickHouseSpendAggregator implements SpendAggregator {
    constructor(private readonly spend: SpendRepository) {}

    async getSpendForScopePeriod(query: SpendAggregatorQuery): Promise<number> {
        return this.spend.getSpendForScope({
            workspaceId: query.workspaceId,
            scopeType: query.scopeType,
            scopeId: query.scopeId,
            from: query.from,
            to: query.to,
            status: "ok",
        });
    }
}
