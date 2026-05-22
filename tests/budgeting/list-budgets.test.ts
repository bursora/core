/**
 * Tests for the listBudgets use case (application layer).
 *
 * Returns budget rows scoped to the requested workspace. Workspace isolation
 * is the only behavior worth verifying here — the repo holds the rows, the
 * use case enforces the workspace filter on read.
 */

import { listBudgetsUseCase } from "@/lib/budgeting";
import { describe, expect, test } from "bun:test";
import { InMemoryBudgetRepository } from "./fakes/in-memory-budget.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "22222222-3333-4444-5555-666666666666";

describe("listBudgetsUseCase", () => {
    test("returns rows belonging to the given workspace", async () => {
        const repo = new InMemoryBudgetRepository();
        await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            amountUsd: "100",
            mode: "block",
        });

        const rows = await listBudgetsUseCase({
            workspaceId: WORKSPACE_A,
            budgets: repo,
        });

        expect(rows.length).toBe(1);
        expect(rows[0]?.workspaceId).toBe(WORKSPACE_A);
    });

    test("does not return rows from another workspace", async () => {
        const repo = new InMemoryBudgetRepository();
        await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            amountUsd: "100",
            mode: "block",
        });
        await repo.create({
            workspaceId: WORKSPACE_B,
            scopeType: "tenant",
            scopeId: "acme",
            period: "monthly",
            amountUsd: "10",
            mode: "notify",
        });

        const rows = await listBudgetsUseCase({
            workspaceId: WORKSPACE_A,
            budgets: repo,
        });

        expect(rows.length).toBe(1);
        expect(rows.every((r) => r.workspaceId === WORKSPACE_A)).toBe(true);
    });

    test("filters by tenantId when provided", async () => {
        const repo = new InMemoryBudgetRepository();
        await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "tenant",
            scopeId: "acme",
            period: "daily",
            amountUsd: "100",
            mode: "block",
        });
        await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "tenant",
            scopeId: "globex",
            period: "daily",
            amountUsd: "50",
            mode: "block",
        });
        await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            amountUsd: "200",
            mode: "block",
        });

        const rows = await listBudgetsUseCase({
            workspaceId: WORKSPACE_A,
            budgets: repo,
            filter: { kind: "tenant", id: "acme" },
        });

        expect(rows.length).toBe(1);
        expect(rows[0]?.scopeType).toBe("tenant");
        expect(rows[0]?.scopeId).toBe("acme");
    });

    test("filters by agentId when provided", async () => {
        const repo = new InMemoryBudgetRepository();
        await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "agent",
            scopeId: "sales-bot",
            period: "monthly",
            amountUsd: "10",
            mode: "notify",
        });
        await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "tenant",
            scopeId: "acme",
            period: "daily",
            amountUsd: "5",
            mode: "block",
        });

        const rows = await listBudgetsUseCase({
            workspaceId: WORKSPACE_A,
            budgets: repo,
            filter: { kind: "agent", id: "sales-bot" },
        });

        expect(rows.length).toBe(1);
        expect(rows[0]?.scopeType).toBe("agent");
        expect(rows[0]?.scopeId).toBe("sales-bot");
    });

    test("filters by workflowId when provided", async () => {
        const repo = new InMemoryBudgetRepository();
        await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "workflow",
            scopeId: "checkout",
            period: "daily",
            amountUsd: "1",
            mode: "block",
        });
        await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "workflow",
            scopeId: "support",
            period: "daily",
            amountUsd: "2",
            mode: "block",
        });

        const rows = await listBudgetsUseCase({
            workspaceId: WORKSPACE_A,
            budgets: repo,
            filter: { kind: "workflow", id: "checkout" },
        });

        expect(rows.length).toBe(1);
        expect(rows[0]?.scopeId).toBe("checkout");
    });
});
