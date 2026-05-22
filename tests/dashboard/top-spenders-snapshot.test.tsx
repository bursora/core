/**
 * TopSpendersSnapshot — month-to-date snapshot of the spend page's top spenders.
 *
 * Server component; tests render it via `await TopSpendersSnapshot(...)` and
 * assert against the static HTML. Data flows through two test seams:
 *  - `setMeteringReadDepsForTesting` to fake `getTopSpenders`
 *  - `setDashboardStatsDepsForTesting` to fake `getSpendMtd`
 */

import { TopSpendersSnapshot } from "@/app/(dashboard)/workspace/[workspaceId]/_components/top-spenders-snapshot";
import {
    setDashboardStatsDepsForTesting,
    type DashboardStatsDeps,
} from "@/app/(dashboard)/workspace/[workspaceId]/_lib/dashboard-stats";
import type { DashboardWindow } from "@/lib/dashboard-window";
import type {
    MeteringReadRepository,
    TopSpenderRow,
    TopSpendersQuery,
} from "@/lib/metering/metering-read.repository";
import { setMeteringReadDepsForTesting } from "@/lib/metering/server";
import { setModelProviderResolverForTesting } from "@/lib/models-server";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

beforeAll(() => {
    mock.module("next/navigation", () => ({
        useRouter: () => ({ replace: () => undefined, push: () => undefined }),
        useSearchParams: () => new URLSearchParams(),
        usePathname: () => "/",
    }));
});

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
    public lastTopSpendersQuery: TopSpendersQuery | null = null;
    constructor(private readonly rows: readonly TopSpenderRow[]) {}
    async spendSeries() {
        return [];
    }
    async topSpenders(query: TopSpendersQuery): Promise<readonly TopSpenderRow[]> {
        this.lastTopSpendersQuery = query;
        return this.rows;
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

const weekWindow = (now: Date): DashboardWindow => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const WEEK_DAYS = 7;
    const dayOfWeek = now.getUTCDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const from = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
    );
    return {
        key: "week",
        from,
        to: now,
        priorFrom: new Date(from.getTime() - WEEK_DAYS * DAY_MS),
        priorTo: from,
        label: "Week",
    };
};

describe("TopSpendersSnapshot", () => {
    afterEach(() => {
        setDashboardStatsDepsForTesting(null);
        setMeteringReadDepsForTesting(null);
        setModelProviderResolverForTesting(null);
    });

    test("renders empty-state copy and a /spend link when there are no spenders", async () => {
        setDashboardStatsDepsForTesting(baseStatsDeps());
        setMeteringReadDepsForTesting({ readRepo: new StubReadRepo([]) });

        const element = await TopSpendersSnapshot({
            workspaceId: WORKSPACE,
            dashboardWindow: monthWindow(new Date()),
            facet: "tenant",
            windowKey: "month",
        });
        const html = renderToStaticMarkup(element);

        expect(html).toContain("Top spenders");
        expect(html).toContain("No spend recorded this month yet.");
        expect(html).toContain(`/workspace/${WORKSPACE}/spend`);
    });

    test("queries top spenders with the active window's [from, to) and limit 5", async () => {
        const repo = new StubReadRepo([]);
        setDashboardStatsDepsForTesting(baseStatsDeps());
        setMeteringReadDepsForTesting({ readRepo: repo });

        const now = new Date("2026-05-17T12:00:00Z");
        const w = monthWindow(now);
        await TopSpendersSnapshot({
            workspaceId: WORKSPACE,
            dashboardWindow: w,
            facet: "tenant",
            windowKey: "month",
        });

        expect(repo.lastTopSpendersQuery).not.toBeNull();
        const q = repo.lastTopSpendersQuery;
        if (q === null) throw new Error("topSpenders was not called");
        expect(q.facet).toBe("tenant");
        expect(q.limit).toBe(5);
        expect(q.workspaceId).toBe(WORKSPACE);
        expect(q.windowStart.getTime()).toBe(w.from.getTime());
        expect(q.windowEnd.getTime()).toBe(w.to.getTime());
    });

    test("re-ranks against the week window when that window is active", async () => {
        const repo = new StubReadRepo([]);
        setDashboardStatsDepsForTesting(baseStatsDeps());
        setMeteringReadDepsForTesting({ readRepo: repo });

        const now = new Date("2026-05-17T12:00:00Z");
        const w = weekWindow(now);
        await TopSpendersSnapshot({
            workspaceId: WORKSPACE,
            dashboardWindow: w,
            facet: "tenant",
            windowKey: "week",
        });

        const q = repo.lastTopSpendersQuery;
        if (q === null) throw new Error("topSpenders was not called");
        expect(q.windowStart.getTime()).toBe(w.from.getTime());
        expect(q.windowEnd.getTime()).toBe(w.to.getTime());
    });

    test("renders the spenders table with rows and the 'View all spend' link", async () => {
        const repo = new StubReadRepo([
            { tag: "tenant-A", costUsd: "12.50000000", callCount: 42, blockedCount: 0 },
            { tag: "tenant-B", costUsd: "5.00000000", callCount: 7, blockedCount: 0 },
        ]);
        setDashboardStatsDepsForTesting(
            baseStatsDeps({ sumSpendBetween: async () => "17.50000000" }),
        );
        setMeteringReadDepsForTesting({ readRepo: repo });

        const element = await TopSpendersSnapshot({
            workspaceId: WORKSPACE,
            dashboardWindow: monthWindow(new Date()),
            facet: "tenant",
            windowKey: "month",
        });
        const html = renderToStaticMarkup(element);

        expect(html).toContain("Top spenders");
        expect(html).toContain("this month");
        expect(html).toContain("tenant-A");
        expect(html).toContain("tenant-B");
        expect(html).toContain("View all spend");
        expect(html).toContain(`/workspace/${WORKSPACE}/spend`);
        // Empty-state copy must not appear when rows exist.
        expect(html).not.toContain("No spend recorded this month yet.");
    });

    test("header sublabel uses the window's label (lowercased)", async () => {
        setDashboardStatsDepsForTesting(baseStatsDeps());
        setMeteringReadDepsForTesting({ readRepo: new StubReadRepo([]) });

        const element = await TopSpendersSnapshot({
            workspaceId: WORKSPACE,
            dashboardWindow: weekWindow(new Date("2026-05-17T12:00:00Z")),
            facet: "tenant",
            windowKey: "week",
        });
        const html = renderToStaticMarkup(element);

        expect(html).toContain("this week");
    });

    test("model facet resolves providers and decorates rows", async () => {
        const repo = new StubReadRepo([
            { tag: "gpt-4o", costUsd: "8.00000000", callCount: 10, blockedCount: 0 },
            { tag: "claude-3-5-sonnet", costUsd: "4.00000000", callCount: 4, blockedCount: 0 },
        ]);
        setDashboardStatsDepsForTesting(
            baseStatsDeps({ sumSpendBetween: async () => "12.00000000" }),
        );
        setMeteringReadDepsForTesting({ readRepo: repo });
        setModelProviderResolverForTesting(async () => ({
            "gpt-4o": "openai",
            "claude-3-5-sonnet": "anthropic",
        }));

        const element = await TopSpendersSnapshot({
            workspaceId: WORKSPACE,
            dashboardWindow: monthWindow(new Date()),
            facet: "model",
            windowKey: "month",
        });
        const html = renderToStaticMarkup(element);

        expect(html).toContain("Top spenders");
        expect(repo.lastTopSpendersQuery?.facet).toBe("model");
        // Slugs resolve to human labels through `displayModel`.
        expect(html).toContain("GPT 4o");
        expect(html).toContain("Claude 3.5 Sonnet");
        expect(html).toContain(`/workspace/${WORKSPACE}/spend?facet=model`);
    });
});
