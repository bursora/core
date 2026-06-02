/**
 * SpendCounter — the running-spend cache that backs the budget check.
 *
 * `record` fans one priced `ok` event out to every scope it rolls up to
 * (workspace always; tenant/agent/workflow when tagged) across all three budget
 * periods (daily/weekly/monthly), incrementing each scope+period counter for
 * the window the event's timestamp falls in. The budget check doesn't know
 * which periods a workspace actually budgets on, so the counter maintains all
 * three; an unread counter just ages out via its TTL.
 *
 * `read` serves one (scope, period) total for the window containing `now`. On a
 * miss (fresh window, cache loss, or a never-seeded counter) it reconciles by
 * summing the matching window from ClickHouse — the canonical store — seeds the
 * counter with that sum, and serves it. Because counters are born from a
 * reconcile (and `record` only bumps existing keys), a counter never serves a
 * partial total.
 *
 * Key shape: `spend:{workspaceId}:{scopeType}:{scopeId}:{period}:{windowFromIso}`.
 * The `period` segment disambiguates windows that share a `from` instant (a
 * daily and a monthly window both starting on the 1st), and the window `from`
 * makes rollover automatic — a new window addresses a fresh key.
 *
 * Money precision: ClickHouse `cost_usd` is `Decimal(22,8)`; the reconcile sum
 * arrives here as a JS number (the `SpendRepository` boundary), and Redis
 * `INCRBYFLOAT` accumulates the running total in floating point. f64 carries ~15
 * significant digits, so totals stay exact far past the cent for realistic
 * spend; the reconcile path re-bases off ClickHouse on every miss, bounding any
 * drift to a single window.
 */

import "server-only";

import type { ScopeType } from "@/lib/budgeting/budget";
import { PERIODS, type Period, periodWindow } from "@/lib/budgeting/period";
import type { SpendRepository } from "@/lib/spend";
import type { SpendCounterStore, SpendIncrement } from "./store";

const KEY_PREFIX = "spend";

export interface RecordSpendEvent {
    readonly workspaceId: string;
    readonly tenantId: string | null;
    readonly agentId: string | null;
    readonly workflowId: string | null;
    /** Priced cost for this event, as a decimal string. */
    readonly costUsd: string;
    /** Event timestamp — picks the window each scope/period counter rolls into. */
    readonly ts: Date;
}

export interface ReadSpendQuery {
    readonly workspaceId: string;
    readonly scopeType: ScopeType;
    readonly scopeId: string | null;
    readonly period: Period;
    /** Wall clock — selects the current period window. */
    readonly now: Date;
}

export interface SpendCounter {
    /**
     * Increment every applicable scope/period counter for each event. `now` is
     * the wall clock; counter TTLs are sized to the remaining window from it.
     */
    record(events: readonly RecordSpendEvent[], now: Date): Promise<void>;
    /** Serve the spend total for one scope+period, reconciling on a miss. */
    read(query: ReadSpendQuery): Promise<number>;
}

export interface SpendCounterDeps {
    readonly store: SpendCounterStore;
    readonly spend: SpendRepository;
}

export function createSpendCounter(deps: SpendCounterDeps): SpendCounter {
    const { store, spend } = deps;

    return {
        async record(events: readonly RecordSpendEvent[], now: Date): Promise<void> {
            const nowMs = now.getTime();
            const ops: SpendIncrement[] = [];

            for (const event of events) {
                if (isZero(event.costUsd)) continue;
                for (const scope of scopesFor(event)) {
                    for (const period of PERIODS) {
                        const window = periodWindow(period, event.ts);
                        const ttlMs = window.to.getTime() - nowMs;
                        // A closed window (event reported after its period ended)
                        // is owned by ClickHouse reconcile, not the live counter.
                        if (ttlMs <= 0) continue;
                        ops.push({
                            key: counterKey(
                                event.workspaceId,
                                scope.scopeType,
                                scope.scopeId,
                                period,
                                window.from,
                            ),
                            delta: event.costUsd,
                            ttlMs,
                        });
                    }
                }
            }

            if (ops.length > 0) await store.increment(ops);
        },

        async read(query: ReadSpendQuery): Promise<number> {
            const window = periodWindow(query.period, query.now);
            const key = counterKey(
                query.workspaceId,
                query.scopeType,
                query.scopeId,
                query.period,
                window.from,
            );

            const cached = await store.get(key);
            if (cached !== null) {
                const value = Number.parseFloat(cached);
                return Number.isFinite(value) ? value : 0;
            }

            // Miss: reconcile from ClickHouse (canonical), seed, then serve.
            const total = await spend.getSpendForScope({
                workspaceId: query.workspaceId,
                scopeType: query.scopeType,
                scopeId: query.scopeId,
                from: window.from,
                to: window.to,
                status: "ok",
            });

            const ttlMs = window.to.getTime() - query.now.getTime();
            if (ttlMs > 0) await store.seed(key, String(total), ttlMs);
            return total;
        },
    };
}

interface CounterScope {
    readonly scopeType: ScopeType;
    readonly scopeId: string | null;
}

/** Every scope an event attributes to: workspace, plus each tag it carries. */
function scopesFor(event: RecordSpendEvent): readonly CounterScope[] {
    const scopes: CounterScope[] = [{ scopeType: "workspace", scopeId: null }];
    if (present(event.tenantId)) scopes.push({ scopeType: "tenant", scopeId: event.tenantId });
    if (present(event.agentId)) scopes.push({ scopeType: "agent", scopeId: event.agentId });
    if (present(event.workflowId)) {
        scopes.push({ scopeType: "workflow", scopeId: event.workflowId });
    }
    return scopes;
}

function present(value: string | null): value is string {
    return value !== null && value !== "";
}

function isZero(costUsd: string): boolean {
    const value = Number.parseFloat(costUsd);
    return !Number.isFinite(value) || value === 0;
}

function counterKey(
    workspaceId: string,
    scopeType: ScopeType,
    scopeId: string | null,
    period: Period,
    windowFrom: Date,
): string {
    return `${KEY_PREFIX}:${workspaceId}:${scopeType}:${scopeId ?? ""}:${period}:${windowFrom.toISOString()}`;
}
