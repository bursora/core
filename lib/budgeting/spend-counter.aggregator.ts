/**
 * SpendCounterAggregator — counter-backed SpendAggregator for the budget
 * preflight hot path.
 *
 * Adapts the `SpendCounter` read model to the `SpendAggregator` port
 * `decideBudget` depends on. The budget check now reads the running Redis spend
 * counter instead of a Postgres `SUM(cost_usd)`; the counter reconciles from
 * ClickHouse (the canonical store) on a miss, so the read stays fresh. That
 * preflight read is also what seeds the counter key, after which ingest
 * increments accumulate against it.
 *
 * The counter is keyed by (workspace, scope, period, window-from), so it needs
 * the budget's `period` and the wall clock `now` to address the same key the
 * ingest path increments. `decideBudget` threads both through the query. The
 * dashboard headroom read reaches this port with only `from`/`to`; for that
 * path the period is recovered from the window duration (the three window
 * lengths are unambiguous) and `now` is the window start — any instant in
 * `[from, to)` selects the same window.
 */

import type { ReadSpendQuery, SpendCounter } from "@/lib/spend-counter";
import type { Period } from "./period";
import type { SpendAggregator, SpendAggregatorQuery } from "./spend-aggregator";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export class SpendCounterAggregator implements SpendAggregator {
    constructor(private readonly counter: SpendCounter) {}

    async getSpendForScopePeriod(query: SpendAggregatorQuery): Promise<number> {
        const read: ReadSpendQuery = {
            workspaceId: query.workspaceId,
            scopeType: query.scopeType,
            scopeId: query.scopeId,
            period: query.period ?? periodForWindow(query.from, query.to),
            now: query.now ?? query.from,
        };
        return this.counter.read(read);
    }
}

function periodForWindow(from: Date, to: Date): Period {
    const ms = to.getTime() - from.getTime();
    if (ms === DAY_MS) return "daily";
    if (ms === WEEK_MS) return "weekly";
    return "monthly";
}
