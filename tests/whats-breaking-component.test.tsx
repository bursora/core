/**
 * Render contract for the dashboard "What breaks first" panel.
 *
 * Covers the empty-state CTA and ETA-badge phrasing (singular vs plural
 * units, urgency tones).
 */

import type { WhatsBreakingRow } from "@/lib/budgeting/whats-breaking";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

const fakeRow = (over: Partial<WhatsBreakingRow> = {}): WhatsBreakingRow => ({
    budgetId: "b1",
    scopeType: "workspace",
    scopeId: null,
    period: "monthly",
    mode: "block",
    limit: 1000,
    spent: 500,
    usage: 0.5,
    etaKind: "eta",
    etaDays: 5,
    periodEnd: new Date("2025-06-01T00:00:00.000Z"),
    ...over,
});

describe("WhatsBreakingPanel empty state", () => {
    test("renders 'Create your first budget' CTA when there are no rows", async () => {
        const { WhatsBreakingPanel } =
            await import("@/components/ui/dashboard-views/whats-breaking");

        const html = renderToStaticMarkup(WhatsBreakingPanel({ workspaceId: WORKSPACE, rows: [] }));

        expect(html).toContain("Create your first budget");
        expect(html).toContain(`/workspace/${WORKSPACE}/budgets`);
    });
});

describe("WhatsBreakingPanel ETA pluralization", () => {
    test("renders 'in 1 hour' (singular) when ETA rounds to 1 hour", async () => {
        const { WhatsBreakingPanel } =
            await import("@/components/ui/dashboard-views/whats-breaking");

        // 1 hour in days = 1/24 ≈ 0.0417, which is < URGENT_DAYS (1) and rounds to 1 hour.
        const row = fakeRow({ etaKind: "eta", etaDays: 1 / 24 });
        const html = renderToStaticMarkup(
            WhatsBreakingPanel({ workspaceId: WORKSPACE, rows: [row] }),
        );

        expect(html).toContain("in 1 hour");
        expect(html).not.toContain("in 1 hours");
    });

    test("renders 'in 1 day' (singular) when ETA rounds to 1 day", async () => {
        const { WhatsBreakingPanel } =
            await import("@/components/ui/dashboard-views/whats-breaking");

        // etaDays = 1 → rendered as "in 1 day" (>= URGENT_DAYS, rounded to 1).
        const row = fakeRow({ etaKind: "eta", etaDays: 1 });
        const html = renderToStaticMarkup(
            WhatsBreakingPanel({ workspaceId: WORKSPACE, rows: [row] }),
        );

        expect(html).toContain("in 1 day");
        expect(html).not.toContain("in 1 days");
    });

    test("renders plural 'hours' / 'days' when count > 1", async () => {
        const { WhatsBreakingPanel } =
            await import("@/components/ui/dashboard-views/whats-breaking");

        const rowHours = fakeRow({ etaKind: "eta", etaDays: 3 / 24 });
        const rowDays = fakeRow({
            budgetId: "b2",
            etaKind: "eta",
            etaDays: 5,
        });
        const html = renderToStaticMarkup(
            WhatsBreakingPanel({ workspaceId: WORKSPACE, rows: [rowHours, rowDays] }),
        );

        expect(html).toContain("in 3 hours");
        expect(html).toContain("in 5 days");
    });
});

describe("WhatsBreakingPanel actionsEnabled", () => {
    test("omits all action links when actionsEnabled is false (empty state)", async () => {
        const { WhatsBreakingPanel } =
            await import("@/components/ui/dashboard-views/whats-breaking");

        const html = renderToStaticMarkup(
            WhatsBreakingPanel({ workspaceId: WORKSPACE, rows: [], actionsEnabled: false }),
        );

        // Empty-state copy still renders, but the CTA button is gone.
        expect(html).toContain("No budgets configured");
        expect(html).not.toContain("Create your first budget");
    });

    test("omits Manage links when actionsEnabled is false", async () => {
        const { WhatsBreakingPanel } =
            await import("@/components/ui/dashboard-views/whats-breaking");

        const html = renderToStaticMarkup(
            WhatsBreakingPanel({
                workspaceId: WORKSPACE,
                rows: [fakeRow()],
                actionsEnabled: false,
            }),
        );

        expect(html).not.toContain(">Manage<");
    });

    test("defaults to actionsEnabled=true (links rendered)", async () => {
        const { WhatsBreakingPanel } =
            await import("@/components/ui/dashboard-views/whats-breaking");

        const html = renderToStaticMarkup(
            WhatsBreakingPanel({ workspaceId: WORKSPACE, rows: [fakeRow()] }),
        );

        expect(html).toContain(">Manage<");
    });
});
