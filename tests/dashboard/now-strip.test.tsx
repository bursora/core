/**
 * NowStrip — 4-column dashboard KPI row covering Spend MTD, Calls MTD,
 * Active budgets, and Alerts 24h.
 *
 * Server component; tests render it via `await NowStrip(...)` and assert
 * against the static HTML. Data is injected via the dashboard-stats and
 * detection test seams; no DB needed.
 */

import { NowStrip } from "@/app/(dashboard)/workspace/[workspaceId]/_components/now-strip";
import type { RawBudget } from "@/lib/budgeting/budget.repository";
import { dashboardWindowFromRange, type DashboardWindow } from "@/lib/dashboard-window";
import {
    setDashboardStatsDepsForTesting,
    type DashboardStatsDeps,
} from "@/lib/dashboard/dashboard-stats";
import type { Alert, AlertRepository, AnomalyAlert, ListAlertsQuery } from "@/lib/detection";
import { setAlertsDepsForTesting } from "@/lib/detection";
import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

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

const fakeBudget = (over: Partial<RawBudget> = {}): RawBudget => ({
    id: over.id ?? "b-1",
    workspaceId: WORKSPACE,
    scopeType: over.scopeType ?? "workspace",
    scopeId: over.scopeId ?? null,
    period: over.period ?? "monthly",
    amountUsd: over.amountUsd ?? "100",
    mode: over.mode ?? "notify",
});

const fakeAlert = (over: Partial<AnomalyAlert> = {}): AnomalyAlert => {
    const raisedAt = over.raisedAt ?? new Date("2026-05-16T11:00:00Z");
    return {
        kind: "anomaly",
        scope: { workspaceId: WORKSPACE, tenantId: null, agentId: null },
        reason: "spike",
        deviation: 4.5,
        severity: "warning",
        raisedAt,
        windowStart: raisedAt,
        windowEnd: new Date(raisedAt.getTime() + 5 * 60_000),
        windowCostUsd: 0.05,
        ...over,
    };
};

class StubAlertRepo implements AlertRepository {
    constructor(private readonly rows: readonly Alert[]) {}
    async insertBatch() {
        return [];
    }
    async recordBudgetCrossing() {
        return { inserted: false, id: null };
    }
    async listForWorkspace(query: ListAlertsQuery): Promise<readonly Alert[]> {
        return this.rows.filter((r) => {
            const workspaceId = r.kind === "budget" ? r.workspaceId : r.scope.workspaceId;
            if (workspaceId !== query.workspaceId) return false;
            if (r.raisedAt.getTime() < query.since.getTime()) return false;
            if (query.until !== undefined && r.raisedAt.getTime() >= query.until.getTime()) {
                return false;
            }
            return true;
        });
    }
}

interface RenderInput {
    readonly stats?: Partial<DashboardStatsDeps>;
    readonly alerts?: readonly Alert[];
    readonly spanMs?: number;
}

const NOW = new Date("2026-05-17T15:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function buildWindow(spanMs: number = 30 * DAY_MS): DashboardWindow {
    // Pin `now` mid-May and span back a whole number of days so the window has
    // a deterministic length, boundaries, and short label ("30d", "7d", ...).
    return dashboardWindowFromRange(new Date(NOW.getTime() - spanMs), NOW);
}

async function render(input: RenderInput = {}): Promise<string> {
    setDashboardStatsDepsForTesting(baseStatsDeps(input.stats ?? {}));
    setAlertsDepsForTesting({ alerts: new StubAlertRepo(input.alerts ?? []) });
    const element = await NowStrip({
        workspaceId: WORKSPACE,
        dashboardWindow: buildWindow(input.spanMs),
    });
    return renderToStaticMarkup(element);
}

describe("NowStrip", () => {
    afterEach(() => {
        setDashboardStatsDepsForTesting(null);
        setAlertsDepsForTesting(null);
    });

    test("renders all four tile labels", async () => {
        const html = await render();

        expect(html).toContain("Spend, 30d");
        expect(html).toContain("Calls, 30d");
        expect(html).toContain("Active budgets");
        expect(html).toContain("Alerts, 24h");
    });

    test("formats the Spend value from the window-aware getSpendInWindow", async () => {
        const html = await render({
            stats: { sumSpendBetween: async () => "1234.50000000" },
        });

        expect(html).toContain("$1,234.50");
    });

    test("formats the Calls value from the window-aware getCallsInWindow", async () => {
        const html = await render({
            stats: { countCallsBetween: async () => 9876 },
        });

        expect(html).toContain("9,876");
    });

    test("delta caption reads 'vs prior'", async () => {
        const html = await render();
        expect(html).toContain("vs prior");
    });

    test("renders window-relative labels (Spend, 7d / Calls, 7d) for a 7-day window", async () => {
        const html = await render({ spanMs: 7 * DAY_MS });
        expect(html).toContain("Spend, 7d");
        expect(html).toContain("Calls, 7d");
    });

    test("renders the active-budgets count via listBudgets", async () => {
        const html = await render({
            stats: {
                listBudgets: async () => [fakeBudget({ id: "a" }), fakeBudget({ id: "b" })],
            },
        });

        // Strip out commas in formatted numbers we don't care about and look for "2".
        expect(html).toMatch(/Active budgets[\s\S]*?\b2\b/);
    });

    test("renders the Spend sparkline inside the Spend tile", async () => {
        // sumSpendBetween is what the spark series calls. Returning a positive
        // value for any bucket guarantees the SVG renders a path.
        const html = await render({
            stats: { sumSpendBetween: async () => "5.00" },
        });

        // The SparkChart renders an <svg>; check for that and the spend tile
        // wrapper that positions it top-right.
        expect(html).toContain("<svg");
        expect(html).toContain("absolute");
    });

    test("shows 'none at 75%+' when no budgets are at or above the warn threshold", async () => {
        const html = await render({
            stats: {
                listBudgets: async () => [fakeBudget({ id: "low", amountUsd: "100" })],
                getBudgetPeriodSpend: async () => 10, // 10% usage
            },
        });

        expect(html).toContain("none at 75%+");
    });

    test("shows 'N at 75%+' and destructive tone when a budget is at risk", async () => {
        const html = await render({
            stats: {
                listBudgets: async () => [
                    fakeBudget({ id: "hot", amountUsd: "100" }),
                    fakeBudget({ id: "cold", amountUsd: "100", scopeId: "x" }),
                ],
                getBudgetPeriodSpend: async ({ scopeId }) => (scopeId === "x" ? 5 : 90),
            },
        });

        expect(html).toMatch(/Active budgets[\s\S]*?\b1\b at 75%\+/);
        expect(html).toContain("text-destructive");
    });

    test("shows 'none raised' when there are no alerts in the last 24h", async () => {
        const html = await render({ alerts: [] });

        expect(html).toMatch(/Alerts, 24h[\s\S]*?none raised/);
    });

    test("formats the critical · warning delta when alerts are present", async () => {
        // Anchor `recent` to the window's `to` so the alert tile picks it up
        // regardless of when the test executes.
        const recent = new Date(buildWindow().to.getTime() - 60 * 1000);
        const html = await render({
            alerts: [
                fakeAlert({ severity: "critical", raisedAt: recent }),
                fakeAlert({ severity: "warning", raisedAt: recent }),
                fakeAlert({ severity: "warning", raisedAt: recent }),
            ],
        });

        expect(html).toMatch(/1 critical[\s\S]*?2 warning/);
    });

    test("renders Alerts 24h with destructive tone when there is at least one critical alert", async () => {
        const recent = new Date(buildWindow().to.getTime() - 60 * 1000);
        const html = await render({
            alerts: [fakeAlert({ severity: "critical", raisedAt: recent })],
        });

        expect(html).toMatch(/Alerts, 24h[\s\S]*?text-destructive/);
    });

    test("renders Alerts 24h with neutral tone when only warning alerts are present", async () => {
        const recent = new Date(buildWindow().to.getTime() - 60 * 1000);
        const html = await render({
            alerts: [fakeAlert({ severity: "warning", raisedAt: recent })],
        });

        // Warning-only never escalates to up/down tone; Kpi's neut branch wins.
        expect(html).toMatch(/Alerts, 24h[\s\S]*?text-muted-foreground\/70/);
    });
});
