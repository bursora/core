/**
 * Tests for the window-aware trajectory loaders in
 * `lib/compose/trajectories.ts`.
 *
 * Both `getCustomerTrajectories` and `getModelTrajectories` accept a
 * `DashboardWindow` and recompute pace / share against
 * `[window.from, window.to)` for current vs `[priorFrom, priorTo)` for prior.
 *
 * Data flows through two test seams:
 *   - `setMeteringReadDepsForTesting` to fake `getSpendSeries`
 *   - `setDashboardStatsDepsForTesting` to fake `getBudgetList`
 */

import {
    setDashboardStatsDepsForTesting,
    type DashboardStatsDeps,
} from "@/lib/dashboard/dashboard-stats";
import { getCustomerTrajectories, getModelTrajectories } from "@/lib/compose/trajectories";
import type { DashboardWindow } from "@/lib/dashboard-window";
import type {
    MeteringReadRepository,
    SpendSeriesQuery,
    TopSpenderRow,
    TopSpendersQuery,
} from "@/lib/metering/metering-read.repository";
import { setMeteringReadDepsForTesting } from "@/lib/metering/server";
import type { SeriesPoint } from "@/lib/metering/spend-series";
import { afterEach, describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

const baseStatsDeps = (over: Partial<DashboardStatsDeps> = {}): DashboardStatsDeps => ({
    sumSpendSince: async () => "0.00000000",
    sumSpendBetween: async () => "0.00000000",
    countCallsSince: async () => 0,
    countCallsBetween: async () => 0,
    listBudgets: async () => [],
    getBudgetPeriodSpend: async () => 0,
    ...over,
});

class StubReadRepo implements MeteringReadRepository {
    public readonly spendSeriesQueries: SpendSeriesQuery[] = [];
    constructor(private readonly points: readonly SeriesPoint[] = []) {}
    async spendSeries(query: SpendSeriesQuery): Promise<readonly SeriesPoint[]> {
        this.spendSeriesQueries.push(query);
        return this.points;
    }
    async topSpenders(_q: TopSpendersQuery): Promise<readonly TopSpenderRow[]> {
        return [];
    }
    async countEvents() {
        return 0;
    }
    async listDistinctValuesBulk() {
        return {};
    }
    async getLastUsageEventAt() {
        return null;
    }
    async listBlockedEventsForBudget() {
        return { items: [], nextCursor: null };
    }
    async countBlockedEventsForBudget() {
        return 0;
    }
    async cumulativeSpendDaily() {
        return [];
    }
}

const monthWindow = (now: Date): DashboardWindow => {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const length = now.getTime() - from.getTime();
    return {
        key: "month",
        from,
        to: now,
        priorFrom: new Date(from.getTime() - length),
        priorTo: from,
        label: "Month",
    };
};

const todayWindow = (now: Date, hoursElapsed: number): DashboardWindow => {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const HOUR_MS = 60 * 60 * 1000;
    const DAY_MS = 24 * HOUR_MS;
    const to = new Date(dayStart.getTime() + hoursElapsed * HOUR_MS);
    return {
        key: "today",
        from: dayStart,
        to,
        priorFrom: new Date(dayStart.getTime() - DAY_MS),
        priorTo: dayStart,
        label: "Today",
    };
};

describe("getCustomerTrajectories (window-aware)", () => {
    afterEach(() => {
        setDashboardStatsDepsForTesting(null);
        setMeteringReadDepsForTesting(null);
    });

    test("returns empty for the today window (partial-day data is too noisy)", async () => {
        setDashboardStatsDepsForTesting(baseStatsDeps());
        const repo = new StubReadRepo();
        setMeteringReadDepsForTesting({ readRepo: repo });

        const now = new Date("2026-05-17T18:00:00Z"); // 18h since UTC midnight
        const window = todayWindow(now, 18);

        const out = await getCustomerTrajectories({ workspaceId: WORKSPACE, window });

        expect(out).toEqual([]);
        // Short-circuit: no DB hit at all.
        expect(repo.spendSeriesQueries).toHaveLength(0);
    });

    test("returns empty when there is no spend in the active window", async () => {
        setDashboardStatsDepsForTesting(baseStatsDeps());
        const repo = new StubReadRepo();
        setMeteringReadDepsForTesting({ readRepo: repo });

        const now = new Date("2026-05-17T12:00:00Z");
        const window = monthWindow(now);

        const out = await getCustomerTrajectories({ workspaceId: WORKSPACE, window });

        expect(out).toEqual([]);
    });

    test("queries current window [from, to) and prior window [priorFrom, priorTo) for tenant spend", async () => {
        setDashboardStatsDepsForTesting(baseStatsDeps());
        const repo = new StubReadRepo();
        setMeteringReadDepsForTesting({ readRepo: repo });

        const now = new Date("2026-05-17T12:00:00Z");
        const window = monthWindow(now);

        await getCustomerTrajectories({ workspaceId: WORKSPACE, window });

        // Two queries: one for current window, one for prior window, both on the tenant facet.
        const tenantQueries = repo.spendSeriesQueries.filter((q) => q.facet === "tenant");
        expect(tenantQueries).toHaveLength(2);
        const currentQ = tenantQueries.find(
            (q) => q.windowStart.getTime() === window.from.getTime(),
        );
        const priorQ = tenantQueries.find(
            (q) => q.windowStart.getTime() === window.priorFrom.getTime(),
        );
        expect(currentQ).toBeDefined();
        expect(priorQ).toBeDefined();
        expect(currentQ?.windowEnd.getTime()).toBe(window.to.getTime());
        expect(priorQ?.windowEnd.getTime()).toBe(window.priorTo.getTime());
    });

    test("flags a tenant whose current/prior daily-mean ratio is at least 2x and breaches budget within horizon", async () => {
        // Window is the May MTD up to 2026-05-17T12:00Z (16.5 days).
        // Tenant-A current spend = $660 over 16.5 days → ~$40/day.
        // Tenant-A prior spend  = $330 over equivalent days → ~$20/day.
        // Ratio = 2.0 → at threshold → flagged.
        // Budget cap $760 monthly; remaining ~$100 at $40/day = 2.5d → inside horizon.
        const now = new Date("2026-05-17T12:00:00Z");
        const window = monthWindow(now);

        const DAY_MS = 24 * 60 * 60 * 1000;
        const alignedDayMs = Math.floor(window.priorFrom.getTime() / DAY_MS) * DAY_MS;
        const alignedPriorBucket = new Date(alignedDayMs);

        class Repo implements MeteringReadRepository {
            public queries: SpendSeriesQuery[] = [];
            async spendSeries(q: SpendSeriesQuery): Promise<readonly SeriesPoint[]> {
                this.queries.push(q);
                if (q.facet !== "tenant") return [];
                const isCurrent = q.windowStart.getTime() === window.from.getTime();
                const isPrior = q.windowStart.getTime() === window.priorFrom.getTime();
                if (isCurrent) {
                    return [
                        {
                            bucket: window.from,
                            tag: "tenant-A",
                            costUsd: "660.00000000",
                            callCount: 1,
                        },
                    ];
                }
                if (isPrior) {
                    return [
                        {
                            bucket: alignedPriorBucket,
                            tag: "tenant-A",
                            costUsd: "330.00000000",
                            callCount: 1,
                        },
                    ];
                }
                return [];
            }
            async topSpenders() {
                return [];
            }
            async countEvents() {
                return 0;
            }
            async listDistinctValuesBulk() {
                return {};
            }
            async getLastUsageEventAt() {
                return null;
            }
            async listBlockedEventsForBudget() {
                return { items: [], nextCursor: null };
            }
            async countBlockedEventsForBudget() {
                return 0;
            }
            async cumulativeSpendDaily() {
                return [];
            }
        }
        const repo = new Repo();
        setMeteringReadDepsForTesting({ readRepo: repo });
        setDashboardStatsDepsForTesting(
            baseStatsDeps({
                listBudgets: async () => [
                    {
                        id: "bud-A",
                        workspaceId: WORKSPACE,
                        scopeType: "tenant",
                        scopeId: "tenant-A",
                        period: "monthly",
                        amountUsd: "760.00",
                        mode: "block",
                    },
                ],
            }),
        );

        const out = await getCustomerTrajectories({ workspaceId: WORKSPACE, window });

        expect(out).toHaveLength(1);
        expect(out[0]?.tenantId).toBe("tenant-A");
        expect(out[0]?.ratio).toBeGreaterThanOrEqual(2.0);
        expect(out[0]?.budgetId).toBe("bud-A");
        expect(out[0]?.budgetPeriod).toBe("monthly");
    });
});

describe("getModelTrajectories (window-aware)", () => {
    afterEach(() => {
        setDashboardStatsDepsForTesting(null);
        setMeteringReadDepsForTesting(null);
    });

    test("returns empty for the today window (partial-day data is too noisy)", async () => {
        setDashboardStatsDepsForTesting(baseStatsDeps());
        const repo = new StubReadRepo();
        setMeteringReadDepsForTesting({ readRepo: repo });

        const now = new Date("2026-05-17T18:00:00Z"); // 18h elapsed
        const window = todayWindow(now, 18);

        const out = await getModelTrajectories({ workspaceId: WORKSPACE, window });

        expect(out).toEqual([]);
        expect(repo.spendSeriesQueries).toHaveLength(0);
    });

    test("queries current window and prior window on the model facet", async () => {
        setDashboardStatsDepsForTesting(baseStatsDeps());
        const repo = new StubReadRepo();
        setMeteringReadDepsForTesting({ readRepo: repo });

        const now = new Date("2026-05-17T12:00:00Z");
        const window = monthWindow(now);

        await getModelTrajectories({ workspaceId: WORKSPACE, window });

        const modelQueries = repo.spendSeriesQueries.filter((q) => q.facet === "model");
        expect(modelQueries).toHaveLength(2);
        const currentQ = modelQueries.find(
            (q) => q.windowStart.getTime() === window.from.getTime(),
        );
        const priorQ = modelQueries.find(
            (q) => q.windowStart.getTime() === window.priorFrom.getTime(),
        );
        expect(currentQ).toBeDefined();
        expect(priorQ).toBeDefined();
    });

    test("flags a model whose share grew >15pp AND cpc jumped >1.5x in the active window", async () => {
        // gpt-4o: prior share ~30%, prior cpc $0.01, now share ~62.5%, now cpc $0.025 → flagged.
        // claude:  prior share ~70%, now share ~37.5%.
        const now = new Date("2026-05-17T12:00:00Z");
        const window = monthWindow(now);
        const DAY_MS = 24 * 60 * 60 * 1000;
        const alignedDayMs = Math.floor(window.priorFrom.getTime() / DAY_MS) * DAY_MS;
        const alignedPriorBucket = new Date(alignedDayMs);

        class Repo implements MeteringReadRepository {
            public queries: SpendSeriesQuery[] = [];
            async spendSeries(q: SpendSeriesQuery): Promise<readonly SeriesPoint[]> {
                this.queries.push(q);
                if (q.facet !== "model") return [];
                const isCurrent = q.windowStart.getTime() === window.from.getTime();
                const isPrior = q.windowStart.getTime() === window.priorFrom.getTime();
                if (isCurrent) {
                    return [
                        {
                            bucket: window.from,
                            tag: "gpt-4o",
                            costUsd: "25.00000000",
                            callCount: 1000,
                        },
                        {
                            bucket: window.from,
                            tag: "claude",
                            costUsd: "15.00000000",
                            callCount: 1500,
                        },
                    ];
                }
                if (isPrior) {
                    return [
                        {
                            bucket: alignedPriorBucket,
                            tag: "gpt-4o",
                            costUsd: "10.00000000",
                            callCount: 1000,
                        },
                        {
                            bucket: alignedPriorBucket,
                            tag: "claude",
                            costUsd: "23.33000000",
                            callCount: 2333,
                        },
                    ];
                }
                return [];
            }
            async topSpenders() {
                return [];
            }
            async countEvents() {
                return 0;
            }
            async listDistinctValuesBulk() {
                return {};
            }
            async getLastUsageEventAt() {
                return null;
            }
            async listBlockedEventsForBudget() {
                return { items: [], nextCursor: null };
            }
            async countBlockedEventsForBudget() {
                return 0;
            }
            async cumulativeSpendDaily() {
                return [];
            }
        }
        const repo = new Repo();
        setMeteringReadDepsForTesting({ readRepo: repo });
        setDashboardStatsDepsForTesting(baseStatsDeps());

        const out = await getModelTrajectories({ workspaceId: WORKSPACE, window });

        expect(out).toHaveLength(1);
        expect(out[0]?.model).toBe("gpt-4o");
        expect(out[0]?.shareNow).toBeGreaterThan(0.6);
        expect(out[0]?.sharePrior).toBeLessThan(0.4);
        expect(out[0]?.cpcRatio).toBeGreaterThan(1.5);
    });
});
