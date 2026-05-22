/**
 * Render contract for the shared BudgetHeader chip-bar.
 *
 * Both the /budgets row and the /budgets/[id] detail page render the same
 * visual identity for a budget: scope id (or scope-type label when null),
 * the period chip, the mode chip, the blocking pill when active, and the
 * reset-countdown caption when the period hasn't ended.
 *
 * These assertions pin the chips so future refactors of the row don't drop
 * any of them on the detail page (or vice versa).
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const NOW = new Date("2025-01-15T12:00:00.000Z");
const ORIGINAL_NOW = Date.now;

function freezeNow(): void {
    Date.now = () => NOW.getTime();
}

function restoreNow(): void {
    Date.now = ORIGINAL_NOW;
}

describe("BudgetHeader", () => {
    test("renders scope id, period, and mode chips", async () => {
        freezeNow();
        try {
            const { BudgetHeader } =
                await import("@/app/(dashboard)/workspace/[workspaceId]/budgets/_components/budget-header");

            const html = renderToStaticMarkup(
                BudgetHeader({
                    budget: {
                        id: "b-1",
                        workspaceId: "ws-1",
                        scopeType: "tenant",
                        scopeId: "acme",
                        period: "monthly",
                        amountUsd: "100",
                        mode: "block",
                    },
                    stats: undefined,
                }),
            );

            expect(html).toContain("acme");
            expect(html).toContain("monthly");
            expect(html).toContain("block");
        } finally {
            restoreNow();
        }
    });

    test("renders the scope-type label when scopeId is null", async () => {
        freezeNow();
        try {
            const { BudgetHeader } =
                await import("@/app/(dashboard)/workspace/[workspaceId]/budgets/_components/budget-header");

            const html = renderToStaticMarkup(
                BudgetHeader({
                    budget: {
                        id: "b-2",
                        workspaceId: "ws-1",
                        scopeType: "workspace",
                        scopeId: null,
                        period: "daily",
                        amountUsd: "100",
                        mode: "notify",
                    },
                    stats: undefined,
                }),
            );

            expect(html).toContain("workspace");
            expect(html).toContain("daily");
            expect(html).toContain("notify");
        } finally {
            restoreNow();
        }
    });

    test("renders the blocking pill when stats.currentlyBlocking is true", async () => {
        freezeNow();
        try {
            const { BudgetHeader } =
                await import("@/app/(dashboard)/workspace/[workspaceId]/budgets/_components/budget-header");

            const html = renderToStaticMarkup(
                BudgetHeader({
                    budget: {
                        id: "b-3",
                        workspaceId: "ws-1",
                        scopeType: "agent",
                        scopeId: "sales-bot",
                        period: "daily",
                        amountUsd: "10",
                        mode: "block",
                    },
                    stats: {
                        usedUsd: 10,
                        calls: 0,
                        tokens: 0,
                        topModel: null,
                        periodFromIso: "2025-01-15T00:00:00.000Z",
                        periodToIso: "2025-01-16T00:00:00.000Z",
                        currentlyBlocking: true,
                        firstTrippedAt: null,
                        crossingCountThisPeriod: 0,
                    },
                }),
            );

            expect(html).toContain("blocking");
        } finally {
            restoreNow();
        }
    });

    test("does not render the blocking pill when stats.currentlyBlocking is false", async () => {
        freezeNow();
        try {
            const { BudgetHeader } =
                await import("@/app/(dashboard)/workspace/[workspaceId]/budgets/_components/budget-header");

            const html = renderToStaticMarkup(
                BudgetHeader({
                    budget: {
                        id: "b-4",
                        workspaceId: "ws-1",
                        scopeType: "workflow",
                        scopeId: "nightly",
                        period: "daily",
                        amountUsd: "10",
                        mode: "notify",
                    },
                    stats: {
                        usedUsd: 0,
                        calls: 0,
                        tokens: 0,
                        topModel: null,
                        periodFromIso: "2025-01-15T00:00:00.000Z",
                        periodToIso: "2025-01-16T00:00:00.000Z",
                        currentlyBlocking: false,
                        firstTrippedAt: null,
                        crossingCountThisPeriod: 0,
                    },
                }),
            );

            expect(html).not.toContain("blocking");
        } finally {
            restoreNow();
        }
    });
});
