/**
 * Tests for `countBlockedEventsForBudget` on the metering read repository.
 *
 * Powers the count badge on the Blocks tab of the budget detail page. Counts
 * rows where `status = 'blocked'` and `decided_by_budget_id = $budgetId`,
 * scoped to the workspace and the budget's current period window.
 */

import type { UsageEventRow } from "@/lib/metering";
import { describe, expect, test } from "bun:test";
import { InMemoryMeteringReadRepository } from "./fakes/in-memory-metering-read.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "22222222-3333-4444-5555-666666666666";
const BUDGET_ID = "99999999-0000-1111-2222-333333333333";
const OTHER_BUDGET_ID = "88888888-1111-2222-3333-444444444444";

const PERIOD_FROM = new Date("2025-05-01T00:00:00Z");
const PERIOD_TO = new Date("2025-06-01T00:00:00Z");

const blocked = (overrides: Partial<UsageEventRow> = {}): UsageEventRow => ({
    workspaceId: WORKSPACE_A,
    tenantId: "tenant-A",
    agentId: null,
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
    decidedByBudgetId: BUDGET_ID,
    ...overrides,
});

describe("countBlockedEventsForBudget", () => {
    test("returns 0 when no blocked events match the budget", async () => {
        const repo = new InMemoryMeteringReadRepository();

        const count = await repo.countBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
        });

        expect(count).toBe(0);
    });

    test("counts blocked rows with matching decided_by_budget_id in the period", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(blocked({ ts: new Date("2025-05-05T10:00:00Z") }));
        repo.add(blocked({ ts: new Date("2025-05-12T10:00:00Z") }));
        repo.add(blocked({ ts: new Date("2025-05-20T10:00:00Z") }));

        const count = await repo.countBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
        });

        expect(count).toBe(3);
    });

    test("excludes ok-status rows even when decided_by_budget_id matches", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(blocked());
        repo.add(blocked({ status: "ok" }));

        const count = await repo.countBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
        });

        expect(count).toBe(1);
    });

    test("excludes rows for other budgets", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(blocked());
        repo.add(blocked({ decidedByBudgetId: OTHER_BUDGET_ID }));
        repo.add(blocked({ decidedByBudgetId: null }));

        const count = await repo.countBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
        });

        expect(count).toBe(1);
    });

    test("excludes rows from other workspaces", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(blocked());
        repo.add(blocked({ workspaceId: WORKSPACE_B }));

        const count = await repo.countBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
        });

        expect(count).toBe(1);
    });

    test("excludes rows outside the period window", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(blocked({ ts: new Date("2025-04-30T23:59:59Z") }));
        repo.add(blocked({ ts: new Date("2025-05-10T10:00:00Z") }));
        repo.add(blocked({ ts: new Date("2025-06-01T00:00:00Z") }));

        const count = await repo.countBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
        });

        expect(count).toBe(1);
    });
});
