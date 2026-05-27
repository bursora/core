/**
 * Data-path smoke for `/budgets/[budgetId]`.
 *
 * The route does three things: look the budget up by id, build a view-model
 * for the Overview section, and either render it or call `notFound()` when
 * the lookup misses. Rendering the React page in `bun:test` runs into the
 * client-hook rabbit hole, so we exercise the data path through fakes and
 * pin the view-model shape.
 *
 * Two contracts:
 *   1. A budget id from another workspace MUST resolve to null so the page
 *      404s. Workspace isolation is enforced by the repository's WHERE clause.
 *   2. A found budget + stats + cumulative series MUST produce the strings,
 *      ratios, and links the page reads at render time (cap, spend, percent,
 *      "view in spend" href, header title/subtitle).
 */

import { buildBudgetDetailView } from "@/lib/budgeting/budget-detail-view";
import { describe, expect, test } from "bun:test";
import { InMemoryBudgetRepository } from "./fakes/in-memory-budget.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "22222222-3333-4444-5555-666666666666";

describe("budget detail data path", () => {
    test("returns null when the id belongs to another workspace (page would 404)", async () => {
        const repo = new InMemoryBudgetRepository();
        const seeded = await repo.create({
            workspaceId: WORKSPACE_B,
            scopeType: "tenant",
            scopeId: "acme",
            period: "monthly",
            amountUsd: "100",
            mode: "block",
        });

        const found = await repo.findById(seeded.id, WORKSPACE_A);

        expect(found).toBeNull();
    });

    test("builds an Overview view-model with spend, cap, percent, sparkline, and spend link", async () => {
        const repo = new InMemoryBudgetRepository();
        const budget = await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "tenant",
            scopeId: "acme",
            period: "monthly",
            amountUsd: "100",
            mode: "block",
        });

        const found = await repo.findById(budget.id, WORKSPACE_A);
        expect(found).not.toBeNull();
        if (found === null) throw new Error("unreachable");

        const periodFrom = new Date("2025-01-01T00:00:00.000Z");
        const periodTo = new Date("2025-01-04T00:00:00.000Z");
        const sparkline = [10, 25, 25];

        const view = buildBudgetDetailView({
            workspaceId: WORKSPACE_A,
            budget: found,
            stats: {
                usedUsd: 25,
                calls: 12,
                tokens: 3000,
                topModel: null,
                periodFromIso: periodFrom.toISOString(),
                periodToIso: periodTo.toISOString(),
                currentlyBlocking: false,
                firstTrippedAt: null,
                crossingCountThisPeriod: 0,
            },
            sparkline,
        });

        expect(view.spendUsd).toBe(25);
        expect(view.capUsd).toBe(100);
        expect(view.ratio).toBeCloseTo(0.25);
        expect(view.sparkline).toEqual([10, 25, 25]);
        expect(view.spendHref).toContain(`/workspace/${WORKSPACE_A}/spend`);
        expect(view.spendHref).toContain("tenant_id=acme");
        expect(view.title).toBe("acme");
        expect(view.subtitle.toLowerCase()).toContain("monthly");
        expect(view.subtitle.toLowerCase()).toContain("block");
    });

    test("workspace-scope budget falls back to scope label as title and omits scope query param", async () => {
        const repo = new InMemoryBudgetRepository();
        const budget = await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            amountUsd: "50",
            mode: "notify",
        });

        const found = await repo.findById(budget.id, WORKSPACE_A);
        if (found === null) throw new Error("unreachable");

        const view = buildBudgetDetailView({
            workspaceId: WORKSPACE_A,
            budget: found,
            stats: {
                usedUsd: 0,
                calls: 0,
                tokens: 0,
                topModel: null,
                periodFromIso: "2025-01-01T00:00:00.000Z",
                periodToIso: "2025-01-02T00:00:00.000Z",
                currentlyBlocking: false,
                firstTrippedAt: null,
                crossingCountThisPeriod: 0,
            },
            sparkline: [],
        });

        expect(view.title).toBe("Workspace");
        expect(view.spendHref).not.toContain("workspace_id");
        expect(view.subtitle.toLowerCase()).toContain("daily");
        expect(view.subtitle.toLowerCase()).toContain("notify");
        expect(view.ratio).toBe(0);
    });
});
