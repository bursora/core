/**
 * Budgeting feature integration test.
 *
 * Drives the public API exposed by `@/features/budgeting` — the surface
 * `app/` and other features depend on. Uses in-memory fakes for the budget
 * repo + spend aggregator; deeper coverage lives in `tests/budgeting/`.
 *
 * Locks the feature folder's public contract: schema re-exports, evaluator,
 * decideBudget use case, create/list/update/delete use cases, and the
 * empty-budgets early-return optimization.
 */

import type { SpendAggregator } from "@/lib/budgeting";
import { budgets as budgetsTable } from "@/lib/db";
import {
    createBudgetUseCase,
    decideBudgetUseCase,
    deleteBudgetUseCase,
    evaluateBudget,
    listBudgetsUseCase,
    updateBudgetUseCase,
    ValidationError,
    type BudgetMode,
    type Period,
    type RawBudget,
    type ScopeType,
} from "@/lib/budgeting";
import { InMemoryBudgetRepository } from "@/tests/budgeting/fakes/in-memory-budget.repository";
import { describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

class RecordingAggregator implements SpendAggregator {
    calls = 0;
    async getSpendForScopePeriod(): Promise<number> {
        this.calls += 1;
        return 0;
    }
}

describe("@/features/budgeting public API", () => {
    test("schema table is re-exported", () => {
        expect(budgetsTable).toBeDefined();
    });

    test("evaluateBudget is re-exported and pure", () => {
        const { decision } = evaluateBudget({ get: () => 0 }, []);
        expect(decision.allow).toBe(true);
        expect(decision.mode).toBe("notify");
        expect(decision.reason).toBe("no_budget");
    });

    test("decideBudget early-returns on empty budgets without calling spend reads", async () => {
        const repo = new InMemoryBudgetRepository();
        const agg = new RecordingAggregator();
        const decision = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
        });

        expect(decision.allow).toBe(true);
        expect(decision.reason).toBe("no_budget");
        expect(agg.calls).toBe(0);
    });

    test("create + list + decide flow through public API", async () => {
        const repo = new InMemoryBudgetRepository();
        const scopeType: ScopeType = "workspace";
        const period: Period = "daily";
        const mode: BudgetMode = "block";

        const created: RawBudget = await createBudgetUseCase({
            workspaceId: WORKSPACE,
            scopeType,
            scopeId: null,
            period,
            amountUsd: "100.00",
            mode,
            budgets: repo,
        });
        expect(created.id).toBeDefined();

        const listed = await listBudgetsUseCase({ workspaceId: WORKSPACE, budgets: repo });
        expect(listed.length).toBe(1);

        const updated = await updateBudgetUseCase({
            id: created.id,
            workspaceId: WORKSPACE,
            patch: { amountUsd: "200.00" },
            budgets: repo,
        });
        expect(updated?.amountUsd).toBe("200.00");

        const agg: SpendAggregator = {
            async getSpendForScopePeriod(): Promise<number> {
                return 50;
            },
        };
        const decision = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
        });
        expect(decision.allow).toBe(true);

        const removed = await deleteBudgetUseCase({
            id: created.id,
            workspaceId: WORKSPACE,
            budgets: repo,
        });
        expect(removed).toBe(true);
    });

    test("createBudget surfaces ValidationError through the feature surface", async () => {
        const repo = new InMemoryBudgetRepository();
        let caught: unknown;
        try {
            await createBudgetUseCase({
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "-1",
                mode: "block",
                budgets: repo,
            });
        } catch (err) {
            caught = err;
        }
        expect(caught).toBeInstanceOf(ValidationError);
    });
});
