/**
 * Data-path smoke for `/budgets/[budgetId]` with the tabs surface.
 *
 * The route composes two reads: the budget + Overview view-model, and the
 * Blocks tab data (count + paged rows). Rendering the React page in
 * `bun:test` runs into the client-hook rabbit hole, so we exercise both data
 * paths through fakes and pin the shapes the page reads.
 */

import { resolveBudgetDetailTab } from "@/app/(dashboard)/workspace/[workspaceId]/budgets/[budgetId]/tabs";
import { buildBudgetDetailView } from "@/lib/budgeting/budget-detail-view";
import type { UsageEventRow } from "@/lib/metering";
import { InMemoryMeteringReadRepository } from "@/tests/metering/fakes/in-memory-metering-read.repository";
import { describe, expect, test } from "bun:test";
import { InMemoryBudgetRepository } from "./fakes/in-memory-budget.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";

const blocked = (overrides: Partial<UsageEventRow> = {}): UsageEventRow => ({
    workspaceId: WORKSPACE_A,
    tenantId: "tenant-A",
    agentId: "agent-X",
    workflowId: null,
    provider: "openai",
    model: "gpt-4o",
    promptTokens: 0,
    completionTokens: 0,
    cacheTokens: 0,
    latencyMs: null,
    costUsd: "0.00000000",
    requestId: null,
    ts: new Date("2025-05-10T10:00:00Z"),
    status: "blocked",
    ...overrides,
});

describe("budget detail tabs data path", () => {
    test("resolveBudgetDetailTab defaults to overview", () => {
        expect(resolveBudgetDetailTab(undefined)).toBe("overview");
        expect(resolveBudgetDetailTab(null)).toBe("overview");
        expect(resolveBudgetDetailTab("nope")).toBe("overview");
        expect(resolveBudgetDetailTab("overview")).toBe("overview");
        expect(resolveBudgetDetailTab("blocks")).toBe("blocks");
    });

    test("composes Overview view-model and Blocks tab data for a found budget", async () => {
        const budgets = new InMemoryBudgetRepository();
        const budget = await budgets.create({
            workspaceId: WORKSPACE_A,
            scopeType: "tenant",
            scopeId: "acme",
            period: "monthly",
            amountUsd: "100",
            mode: "block",
        });

        const found = await budgets.findById(budget.id, WORKSPACE_A);
        if (found === null) throw new Error("unreachable");

        const periodFrom = new Date("2025-05-01T00:00:00Z");
        const periodTo = new Date("2025-06-01T00:00:00Z");

        const metering = new InMemoryMeteringReadRepository();
        metering.add(
            blocked({
                ts: new Date("2025-05-10T10:00:00Z"),
                decidedByBudgetId: found.id,
            }),
        );
        metering.add(
            blocked({
                ts: new Date("2025-05-12T10:00:00Z"),
                decidedByBudgetId: found.id,
            }),
        );
        // unrelated budget — must not appear in our results
        metering.add(
            blocked({
                ts: new Date("2025-05-15T10:00:00Z"),
                decidedByBudgetId: "00000000-0000-0000-0000-000000000000",
            }),
        );

        const sparkline = [10];
        const view = buildBudgetDetailView({
            workspaceId: WORKSPACE_A,
            budget: found,
            stats: {
                usedUsd: 10,
                calls: 1,
                tokens: 100,
                topModel: null,
                periodFromIso: periodFrom.toISOString(),
                periodToIso: periodTo.toISOString(),
                currentlyBlocking: false,
                firstTrippedAt: null,
                crossingCountThisPeriod: 0,
            },
            sparkline,
        });

        const [blockedCount, blockedPage] = await Promise.all([
            metering.countBlockedEventsForBudget({
                workspaceId: WORKSPACE_A,
                budgetId: found.id,
                from: periodFrom,
                to: periodTo,
            }),
            metering.listBlockedEventsForBudget({
                workspaceId: WORKSPACE_A,
                budgetId: found.id,
                from: periodFrom,
                to: periodTo,
                limit: 50,
            }),
        ]);

        // Overview view-model still composes correctly.
        expect(view.title).toBe("acme");
        expect(view.spendUsd).toBe(10);
        expect(view.capUsd).toBe(100);

        // Blocks tab data — count and rows scoped to this budget only.
        expect(blockedCount).toBe(2);
        expect(blockedPage.items.map((r) => r.ts)).toEqual([
            "2025-05-12T10:00:00.000Z",
            "2025-05-10T10:00:00.000Z",
        ]);
        expect(blockedPage.nextCursor).toBeNull();
    });
});
