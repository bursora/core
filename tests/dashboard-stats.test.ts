/**
 * Smoke tests for the dashboard stats helpers.
 *
 * Uses the dependency override hook so these tests don't touch Postgres.
 * Each helper is verified to delegate to the injected dep and return the
 * shape the dashboard page expects.
 */

import { dashboardWindowFromRange } from "@/lib/dashboard-window";
import {
    computeDelta,
    confidenceLabel,
    countActiveBudgets,
    getBudgetHeadroom,
    getBudgetList,
    getCallsDelta,
    getCallsInWindow,
    getCallsMtd,
    getCallsMtdDelta,
    getCallsMtdSeries,
    getCallsSeries,
    getDailyRateInWindow,
    getMonthlySpendCap,
    getProjectedEom,
    getSpendDelta,
    getSpendInWindow,
    getSpendMtd,
    getSpendMtdDelta,
    getSpendMtdSeries,
    getSpendPaceInWindow,
    getSpendSeries,
    paceDirection,
    setDashboardStatsDepsForTesting,
    type DashboardStatsDeps,
} from "@/lib/dashboard/dashboard-stats";
import type { MeteringFilters } from "@/lib/metering/metering-read.repository";
import { afterEach, describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

const baseDeps = (over: Partial<DashboardStatsDeps> = {}): DashboardStatsDeps => ({
    sumSpendSince: async () => "0.00000000",
    sumSpendBetween: async () => "0.00000000",
    countCallsSince: async () => 0,
    countCallsBetween: async () => 0,
    usageSeriesByDay: async () => [],
    listBudgets: async () => [],
    getBudgetPeriodSpend: async () => 0,
    ...over,
});

describe("dashboard-stats", () => {
    afterEach(() => {
        setDashboardStatsDepsForTesting(null);
    });

    test("getSpendMtd sums spend since the start of the current month", async () => {
        let capturedSince: Date | undefined;
        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendSince: async (workspaceId, since) => {
                    expect(workspaceId).toBe(WORKSPACE);
                    capturedSince = since;
                    return "12.34000000";
                },
            }),
        );

        const total = await getSpendMtd({
            workspaceId: WORKSPACE,
            now: new Date("2025-05-10T11:30:00Z"),
        });

        expect(total).toBe("12.34000000");
        expect(capturedSince?.toISOString()).toBe("2025-05-01T00:00:00.000Z");
    });

    test("countActiveBudgets returns the number of budgets for the workspace", async () => {
        setDashboardStatsDepsForTesting(
            baseDeps({
                listBudgets: async (workspaceId) => {
                    expect(workspaceId).toBe(WORKSPACE);
                    return [fakeBudget(), fakeBudget(), fakeBudget()];
                },
            }),
        );

        expect(await countActiveBudgets(WORKSPACE)).toBe(3);
    });

    test("getBudgetList routes the read through the deps layer", async () => {
        const rows = [fakeBudget({ id: "b-1" }), fakeBudget({ id: "b-2" })];
        let captured: string | undefined;
        setDashboardStatsDepsForTesting(
            baseDeps({
                listBudgets: async (workspaceId) => {
                    captured = workspaceId;
                    return rows;
                },
            }),
        );

        const out = await getBudgetList(WORKSPACE);

        expect(captured).toBe(WORKSPACE);
        expect(out.map((r) => r.id)).toEqual(["b-1", "b-2"]);
    });

    test("computeDelta returns 0 when prior period was zero and current is zero", () => {
        expect(computeDelta(0, 0)).toBe(0);
    });

    test("computeDelta treats zero prior as 1.0 if current is positive", () => {
        expect(computeDelta(10, 0)).toBe(1);
    });

    test("computeDelta returns +12% when current is 12% above prior", () => {
        expect(computeDelta(112, 100)).toBeCloseTo(0.12, 5);
    });

    test("computeDelta returns -25% when current is 25% below prior", () => {
        expect(computeDelta(75, 100)).toBeCloseTo(-0.25, 5);
    });

    test("getSpendMtdSeries returns 7 daily totals via sumSpendBetween", async () => {
        const calls: Array<{ since: Date; until: Date }> = [];
        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendBetween: async (_w, since, until) => {
                    calls.push({ since, until });
                    return String(calls.length);
                },
            }),
        );

        const series = await getSpendMtdSeries({
            workspaceId: WORKSPACE,
            now: new Date("2025-05-10T11:30:00Z"),
        });

        expect(series).toHaveLength(7);
        expect(series[0]).toBe(1);
        expect(series[6]).toBe(7);
        // last bucket ends at end-of-day 2025-05-10 UTC; first bucket starts 6 days earlier
        expect(calls[0]!.since.toISOString()).toBe("2025-05-04T00:00:00.000Z");
        expect(calls[6]!.until.toISOString()).toBe("2025-05-11T00:00:00.000Z");
    });

    test("getSpendMtdDelta compares last 7 days vs prior 7 days", async () => {
        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendBetween: async (_w, since) => {
                    // recent window starts 2025-05-04 (now=2025-05-10, end-exclusive=05-11).
                    const recent = new Date("2025-05-04T00:00:00Z").getTime();
                    return since.getTime() === recent ? "120" : "100";
                },
            }),
        );

        const delta = await getSpendMtdDelta({
            workspaceId: WORKSPACE,
            now: new Date("2025-05-10T11:30:00Z"),
        });

        expect(delta).toBeCloseTo(0.2, 5);
    });

    test("getCallsMtd delegates to countCallsSince at start of UTC month", async () => {
        let capturedSince: Date | undefined;
        setDashboardStatsDepsForTesting(
            baseDeps({
                countCallsSince: async (_w, since) => {
                    capturedSince = since;
                    return 42;
                },
            }),
        );

        const total = await getCallsMtd({
            workspaceId: WORKSPACE,
            now: new Date("2025-05-10T11:30:00Z"),
        });

        expect(total).toBe(42);
        expect(capturedSince?.toISOString()).toBe("2025-05-01T00:00:00.000Z");
    });

    test("getCallsMtdSeries returns 7 daily counts via countCallsBetween", async () => {
        let calls = 0;
        setDashboardStatsDepsForTesting(
            baseDeps({
                countCallsBetween: async () => ++calls,
            }),
        );

        const series = await getCallsMtdSeries({
            workspaceId: WORKSPACE,
            now: new Date("2025-05-10T11:30:00Z"),
        });

        expect(series).toHaveLength(7);
        expect(series[0]).toBe(1);
        expect(series[6]).toBe(7);
    });

    test("getCallsMtdDelta compares last 7 days vs prior 7 days", async () => {
        setDashboardStatsDepsForTesting(
            baseDeps({
                countCallsBetween: async (_w, since) => {
                    const recent = new Date("2025-05-04T00:00:00Z").getTime();
                    return since.getTime() === recent ? 120 : 100;
                },
            }),
        );

        const delta = await getCallsMtdDelta({
            workspaceId: WORKSPACE,
            now: new Date("2025-05-10T11:30:00Z"),
        });

        expect(delta).toBeCloseTo(0.2, 5);
    });

    test("getProjectedEom extrapolates MTD spend to a full month", async () => {
        setDashboardStatsDepsForTesting(
            baseDeps({
                // MTD window: $50 over 10 days → $5/day → ~$155 projection for 31-day May.
                sumSpendBetween: async (_w, since) => {
                    const monthStart = new Date("2025-05-01T00:00:00Z").getTime();
                    const priorStart = new Date("2025-04-01T00:00:00Z").getTime();
                    if (since.getTime() === monthStart) return "50.00000000";
                    if (since.getTime() === priorStart) return "120.00000000";
                    return "0.00000000";
                },
            }),
        );

        const result = await getProjectedEom({
            workspaceId: WORKSPACE,
            now: new Date("2025-05-10T12:00:00Z"),
        });

        expect(result.daysInMonth).toBe(31);
        expect(result.daysElapsed).toBe(10);
        expect(result.priorMonth).toBe(120);
        expect(result.dailyRate).toBeCloseTo(50 / (9 + 12 / 24), 2);
        expect(result.projected).toBeCloseTo(result.dailyRate * 31, 2);
    });

    test("getSpendMtd forwards filters to sumSpendSince", async () => {
        let capturedFilters: MeteringFilters | undefined;
        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendSince: async (_w, _since, filters) => {
                    capturedFilters = filters;
                    return "1.00";
                },
            }),
        );

        await getSpendMtd({
            workspaceId: WORKSPACE,
            now: new Date("2025-05-10T11:30:00Z"),
            filters: { provider: ["openai"], tenantId: ["t1"] },
        });

        expect(capturedFilters).toEqual({ provider: ["openai"], tenantId: ["t1"] });
    });

    test("getCallsMtd forwards filters to countCallsSince", async () => {
        let capturedFilters: MeteringFilters | undefined;
        setDashboardStatsDepsForTesting(
            baseDeps({
                countCallsSince: async (_w, _since, filters) => {
                    capturedFilters = filters;
                    return 7;
                },
            }),
        );

        await getCallsMtd({
            workspaceId: WORKSPACE,
            now: new Date("2025-05-10T11:30:00Z"),
            filters: { agentId: ["a1"] },
        });

        expect(capturedFilters).toEqual({ agentId: ["a1"] });
    });

    test("getSpendMtdSeries forwards filters to sumSpendBetween", async () => {
        const captured: Array<MeteringFilters | undefined> = [];
        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendBetween: async (_w, _s, _u, filters) => {
                    captured.push(filters);
                    return "0";
                },
            }),
        );

        await getSpendMtdSeries({
            workspaceId: WORKSPACE,
            now: new Date("2025-05-10T11:30:00Z"),
            filters: { model: ["gpt-4o"] },
        });

        expect(captured).toHaveLength(7);
        expect(captured[0]).toEqual({ model: ["gpt-4o"] });
        expect(captured[6]).toEqual({ model: ["gpt-4o"] });
    });

    test("getProjectedEom forwards filters to sumSpendBetween", async () => {
        let capturedFilters: MeteringFilters | undefined;
        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendBetween: async (_w, _s, _u, filters) => {
                    capturedFilters = filters;
                    return "0";
                },
            }),
        );

        await getProjectedEom({
            workspaceId: WORKSPACE,
            now: new Date("2025-05-10T12:00:00Z"),
            filters: { workflowId: ["wf1"] },
        });

        expect(capturedFilters).toEqual({ workflowId: ["wf1"] });
    });

    test("getBudgetHeadroom sorts budgets by usage descending and truncates", async () => {
        setDashboardStatsDepsForTesting(
            baseDeps({
                listBudgets: async () => [
                    fakeBudget({ id: "low", amountUsd: "100" }),
                    fakeBudget({ id: "high", amountUsd: "100" }),
                    fakeBudget({ id: "mid", amountUsd: "100" }),
                ],
                getBudgetPeriodSpend: async ({ scopeId }) => {
                    if (scopeId === "high") return 95;
                    if (scopeId === "mid") return 50;
                    return 10;
                },
            }),
        );

        const rows = await getBudgetHeadroom({ workspaceId: WORKSPACE, limit: 2 });

        expect(rows).toHaveLength(2);
        expect(rows[0]?.id).toBe("high");
        expect(rows[0]?.usage).toBeCloseTo(0.95, 5);
        expect(rows[1]?.id).toBe("mid");
    });

    test("getMonthlySpendCap returns the workspace-scope monthly budget cap when present", async () => {
        setDashboardStatsDepsForTesting(
            baseDeps({
                listBudgets: async () => [
                    fakeBudget({ scopeType: "tenant", scopeId: "t1", amountUsd: "10" }),
                    fakeBudget({
                        scopeType: "workspace",
                        scopeId: null,
                        period: "monthly",
                        amountUsd: "750.50",
                    }),
                ],
            }),
        );

        expect(await getMonthlySpendCap(WORKSPACE)).toBe(750.5);
    });

    test("getMonthlySpendCap returns null when no workspace-scope monthly budget exists", async () => {
        setDashboardStatsDepsForTesting(
            baseDeps({
                listBudgets: async () => [],
            }),
        );

        expect(await getMonthlySpendCap(WORKSPACE)).toBeNull();
    });

    test("getSpendDelta compares window vs prior window of the same length", async () => {
        const from = new Date("2026-05-11T00:00:00Z");
        const to = new Date("2026-05-17T09:00:00Z");
        const length = to.getTime() - from.getTime();
        const priorFrom = new Date(from.getTime() - length);
        const priorTo = from;

        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendBetween: async (_w, since) => {
                    if (since.getTime() === from.getTime()) return "200";
                    if (since.getTime() === priorFrom.getTime()) return "100";
                    return "0";
                },
            }),
        );

        const delta = await getSpendDelta({
            workspaceId: WORKSPACE,
            from,
            to,
            priorFrom,
            priorTo,
        });

        expect(delta).toBeCloseTo(1.0, 5);
    });

    test("getCallsDelta compares window vs prior window of the same length", async () => {
        const from = new Date("2026-05-17T00:00:00Z");
        const to = new Date("2026-05-17T15:00:00Z");
        const priorFrom = new Date("2026-05-16T00:00:00Z");
        const priorTo = from;

        setDashboardStatsDepsForTesting(
            baseDeps({
                countCallsBetween: async (_w, since) => {
                    if (since.getTime() === from.getTime()) return 150;
                    if (since.getTime() === priorFrom.getTime()) return 100;
                    return 0;
                },
            }),
        );

        const delta = await getCallsDelta({
            workspaceId: WORKSPACE,
            from,
            to,
            priorFrom,
            priorTo,
        });

        expect(delta).toBeCloseTo(0.5, 5);
    });

    test("getSpendSeries maps one grouped read onto a UTC-day grid across [from, to]", async () => {
        let callCount = 0;
        let captured: { from: Date; to: Date } | undefined;
        setDashboardStatsDepsForTesting(
            baseDeps({
                usageSeriesByDay: async (_w, from, to) => {
                    callCount += 1;
                    captured = { from, to };
                    return [
                        {
                            bucketMs: new Date("2026-05-11T00:00:00Z").getTime(),
                            cost: 1,
                            count: 10,
                        },
                        {
                            bucketMs: new Date("2026-05-13T00:00:00Z").getTime(),
                            cost: 3,
                            count: 30,
                        },
                    ];
                },
            }),
        );

        const series = await getSpendSeries({
            workspaceId: WORKSPACE,
            from: new Date("2026-05-11T00:00:00Z"),
            to: new Date("2026-05-17T09:00:00Z"),
        });

        // 7 daily buckets covering Mon..Sun; only the 11th and 13th have spend.
        expect(series).toEqual([1, 0, 3, 0, 0, 0, 0]);
        // One grouped read, widened to whole UTC days.
        expect(callCount).toBe(1);
        expect(captured?.from.toISOString()).toBe("2026-05-11T00:00:00.000Z");
        expect(captured?.to.toISOString()).toBe("2026-05-18T00:00:00.000Z");
    });

    test("getSpendSeries returns a single bucket for a sub-day window (today)", async () => {
        let callCount = 0;
        setDashboardStatsDepsForTesting(
            baseDeps({
                usageSeriesByDay: async () => {
                    callCount += 1;
                    return [
                        { bucketMs: new Date("2026-05-17T00:00:00Z").getTime(), cost: 5, count: 2 },
                    ];
                },
            }),
        );

        const series = await getSpendSeries({
            workspaceId: WORKSPACE,
            from: new Date("2026-05-17T00:00:00Z"),
            to: new Date("2026-05-17T15:00:00Z"),
        });

        expect(series).toEqual([5]);
        expect(callCount).toBe(1);
    });

    test("getCallsSeries maps call counts onto one bucket per UTC day", async () => {
        setDashboardStatsDepsForTesting(
            baseDeps({
                usageSeriesByDay: async () => [
                    { bucketMs: new Date("2026-05-11T00:00:00Z").getTime(), cost: 0, count: 7 },
                    { bucketMs: new Date("2026-05-12T00:00:00Z").getTime(), cost: 0, count: 4 },
                ],
            }),
        );

        const series = await getCallsSeries({
            workspaceId: WORKSPACE,
            from: new Date("2026-05-11T00:00:00Z"),
            to: new Date("2026-05-13T12:00:00Z"),
        });

        // Mon, Tue, Wed-so-far → 3 buckets; Wed has no rows yet.
        expect(series).toEqual([7, 4, 0]);
    });

    test("getSpendInWindow returns the sumSpendBetween total as a number", async () => {
        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendBetween: async () => "42.50000000",
            }),
        );

        const total = await getSpendInWindow({
            workspaceId: WORKSPACE,
            from: new Date("2026-05-11T00:00:00Z"),
            to: new Date("2026-05-17T09:00:00Z"),
        });

        expect(total).toBe(42.5);
    });

    test("getCallsInWindow returns the countCallsBetween count", async () => {
        setDashboardStatsDepsForTesting(
            baseDeps({
                countCallsBetween: async () => 17,
            }),
        );

        const count = await getCallsInWindow({
            workspaceId: WORKSPACE,
            from: new Date("2026-05-11T00:00:00Z"),
            to: new Date("2026-05-17T09:00:00Z"),
        });

        expect(count).toBe(17);
    });

    test("paceDirection returns 'accelerating' when delta exceeds +5%", () => {
        expect(paceDirection(0.06)).toBe("accelerating");
        expect(paceDirection(0.5)).toBe("accelerating");
    });

    test("paceDirection returns 'cooling' when delta is below -5%", () => {
        expect(paceDirection(-0.06)).toBe("cooling");
        expect(paceDirection(-0.5)).toBe("cooling");
    });

    test("paceDirection returns 'steady' within the +/-5% band", () => {
        expect(paceDirection(0)).toBe("steady");
        expect(paceDirection(0.05)).toBe("steady");
        expect(paceDirection(-0.05)).toBe("steady");
        expect(paceDirection(0.04)).toBe("steady");
    });

    test("confidenceLabel returns 'high' once at least 7 days of data have elapsed", () => {
        expect(confidenceLabel(7)).toBe("high (7 days of data)");
        expect(confidenceLabel(31)).toBe("high (31 days of data)");
    });

    test("confidenceLabel returns 'low (only N days)' before day 7", () => {
        expect(confidenceLabel(0)).toBe("low (only 0 days)");
        expect(confidenceLabel(6)).toBe("low (only 6 days)");
    });

    test("getDailyRateInWindow treats today as a single day (partial day → daysElapsed=1)", async () => {
        const window = dashboardWindowFromRange(
            new Date("2026-05-17T00:00:00Z"),
            new Date("2026-05-17T15:00:00Z"),
        );
        let captured: { since?: Date; until?: Date } = {};
        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendBetween: async (_w, since, until) => {
                    captured = { since, until };
                    return "40.00000000";
                },
            }),
        );

        const result = await getDailyRateInWindow({ workspaceId: WORKSPACE, window });

        expect(result.daysElapsed).toBe(1);
        expect(result.dailyRate).toBe(40);
        expect(captured.since?.toISOString()).toBe("2026-05-17T00:00:00.000Z");
        expect(captured.until?.toISOString()).toBe("2026-05-17T15:00:00.000Z");
    });

    test("getDailyRateInWindow divides week spend by whole days elapsed (min 1)", async () => {
        // Mon 2026-05-11 00:00 → Sun 2026-05-17 15:00 is 6.6 days → 7 whole days.
        const window = dashboardWindowFromRange(
            new Date("2026-05-11T00:00:00Z"),
            new Date("2026-05-17T15:00:00Z"),
        );
        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendBetween: async () => "70.00000000",
            }),
        );

        const result = await getDailyRateInWindow({ workspaceId: WORKSPACE, window });

        expect(result.daysElapsed).toBe(7);
        expect(result.dailyRate).toBeCloseTo(10, 5);
    });

    test("getDailyRateInWindow divides month spend by whole days elapsed (min 1)", async () => {
        // 2026-05-01 00:00 → 2026-05-10 12:00 = 9.5 days → 10 whole-days-elapsed.
        const window = dashboardWindowFromRange(
            new Date("2026-05-01T00:00:00Z"),
            new Date("2026-05-10T12:00:00Z"),
        );
        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendBetween: async () => "50.00000000",
            }),
        );

        const result = await getDailyRateInWindow({ workspaceId: WORKSPACE, window });

        expect(result.daysElapsed).toBe(10);
        expect(result.dailyRate).toBeCloseTo(5, 5);
    });

    test("getDailyRateInWindow returns zero rate when there's no spend", async () => {
        const window = dashboardWindowFromRange(
            new Date("2026-05-01T00:00:00Z"),
            new Date("2026-05-17T15:00:00Z"),
        );
        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendBetween: async () => "0.00000000",
            }),
        );

        const result = await getDailyRateInWindow({ workspaceId: WORKSPACE, window });

        expect(result.dailyRate).toBe(0);
        expect(result.daysElapsed).toBeGreaterThanOrEqual(1);
    });

    test("getSpendPaceInWindow compares window spend vs prior-period spend at same elapsed fraction", async () => {
        const window = dashboardWindowFromRange(
            new Date("2026-05-11T00:00:00Z"),
            new Date("2026-05-17T15:00:00Z"),
        );
        const elapsed = window.to.getTime() - window.from.getTime();
        const priorEnd = new Date(window.priorFrom.getTime() + elapsed);

        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendBetween: async (_w, since, until) => {
                    if (
                        since.getTime() === window.from.getTime() &&
                        until.getTime() === window.to.getTime()
                    ) {
                        return "120";
                    }
                    if (
                        since.getTime() === window.priorFrom.getTime() &&
                        until.getTime() === priorEnd.getTime()
                    ) {
                        return "100";
                    }
                    return "0";
                },
            }),
        );

        const delta = await getSpendPaceInWindow({
            workspaceId: WORKSPACE,
            window,
            now: window.to,
        });

        expect(delta).toBeCloseTo(0.2, 5);
    });

    test("getSpendPaceInWindow clamps current to now and truncates prior to the elapsed slice", async () => {
        // Window runs to end-of-day (future); now is 6h in.
        const window = dashboardWindowFromRange(
            new Date("2026-05-17T00:00:00.000Z"),
            new Date("2026-05-17T23:59:59.999Z"),
        );
        const now = new Date("2026-05-17T06:00:00.000Z");
        const priorTruncEnd = new Date(window.priorFrom.getTime() + 6 * 60 * 60 * 1000);

        setDashboardStatsDepsForTesting(
            baseDeps({
                sumSpendBetween: async (_w, since, until) => {
                    // current = [from, now) → 60; prior = [priorFrom, +6h) → 50.
                    if (
                        since.getTime() === window.from.getTime() &&
                        until.getTime() === now.getTime()
                    ) {
                        return "60";
                    }
                    if (
                        since.getTime() === window.priorFrom.getTime() &&
                        until.getTime() === priorTruncEnd.getTime()
                    ) {
                        return "50";
                    }
                    // Full-window or full-prior reads must NOT be used.
                    return "999";
                },
            }),
        );

        const delta = await getSpendPaceInWindow({ workspaceId: WORKSPACE, window, now });

        expect(delta).toBeCloseTo(0.2, 5); // (60 - 50) / 50, not a partial-vs-full figure
    });
});

function fakeBudget(
    over: Partial<{
        id: string;
        scopeType: "workspace" | "tenant" | "agent" | "workflow";
        scopeId: string | null;
        period: "daily" | "weekly" | "monthly";
        amountUsd: string;
        mode: "notify" | "throttle" | "block";
    }> = {},
) {
    return {
        id: over.id ?? "b-1",
        workspaceId: WORKSPACE,
        scopeType: over.scopeType ?? "tenant",
        scopeId: over.scopeId ?? over.id ?? null,
        period: over.period ?? "monthly",
        amountUsd: over.amountUsd ?? "100",
        mode: over.mode ?? "notify",
    } as const;
}
