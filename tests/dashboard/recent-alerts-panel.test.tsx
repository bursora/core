/**
 * RecentAlertsPanel — feed of the 5 most recent anomalies in the last 24h.
 *
 * Server component; tests render via `await RecentAlertsPanel(...)`. The
 * `listAlerts` data source is mocked via the existing
 * `setAlertsDepsForTesting` seam, the same one used by `now-strip.test.tsx`.
 */

import { RecentAlertsPanel } from "@/app/(dashboard)/workspace/[workspaceId]/_components/recent-alerts-panel";
import type { Alert, AlertRepository, AnomalyAlert, ListAlertsQuery } from "@/lib/detection";
import { setAlertsDepsForTesting } from "@/lib/detection";
import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

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
    constructor(private readonly rows: readonly AnomalyAlert[]) {}
    async insertBatch() {
        return [];
    }
    async recordBudgetCrossing() {
        return { inserted: false, id: null };
    }
    async listForWorkspace(query: ListAlertsQuery): Promise<readonly Alert[]> {
        return this.rows.slice(0, query.limit);
    }
}

async function render(rows: readonly AnomalyAlert[]): Promise<string> {
    setAlertsDepsForTesting({ alerts: new StubAlertRepo(rows) });
    const element = await RecentAlertsPanel({ workspaceId: WORKSPACE });
    return renderToStaticMarkup(element);
}

describe("RecentAlertsPanel", () => {
    afterEach(() => {
        setAlertsDepsForTesting(null);
    });

    test("renders empty-state copy when there are no alerts", async () => {
        const html = await render([]);

        expect(html).toContain("No alerts in the last 24 hours");
        expect(html).toContain("agents behaving");
    });

    test("maps critical severity to the FeedItem 'block' kind", async () => {
        const html = await render([
            fakeAlert({ severity: "critical", reason: "10x spike vs baseline" }),
        ]);

        expect(html).toContain("text-destructive");
        expect(html).toContain("block");
        expect(html).toContain("10x spike vs baseline");
    });

    test("maps warning severity to the FeedItem 'warn' kind", async () => {
        const html = await render([
            fakeAlert({ severity: "warning", reason: "2x spike vs baseline" }),
        ]);

        expect(html).toContain("text-warning");
        expect(html).toContain("warn");
        expect(html).toContain("2x spike vs baseline");
    });

    test("renders 'View all →' linking to the workspace alerts page", async () => {
        const html = await render([]);

        expect(html).toContain("View all");
        expect(html).toContain(`href="/workspace/${WORKSPACE}/alerts"`);
    });

    test("preserves the order returned by listAlerts (no client-side re-sort)", async () => {
        const older = fakeAlert({
            raisedAt: new Date("2026-05-16T08:00:00Z"),
            reason: "older incident",
        });
        const newer = fakeAlert({
            raisedAt: new Date("2026-05-16T11:00:00Z"),
            reason: "newer incident",
        });
        // Hand back rows in `older → newer` order; the panel must keep that.
        const html = await render([older, newer]);

        const olderAt = html.indexOf("older incident");
        const newerAt = html.indexOf("newer incident");
        expect(olderAt).toBeGreaterThan(-1);
        expect(newerAt).toBeGreaterThan(-1);
        expect(olderAt).toBeLessThan(newerAt);
    });

    test("uses 'workspace' as the FeedItem 'who' when no scope id is set", async () => {
        const html = await render([
            fakeAlert({
                scope: { workspaceId: WORKSPACE, tenantId: null, agentId: null },
                reason: "workspace-scoped spike",
            }),
        ]);

        expect(html).toContain(">workspace<");
        expect(html).toContain("workspace-scoped spike");
    });
});
