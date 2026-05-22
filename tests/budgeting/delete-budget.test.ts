/**
 * Tests for the deleteBudget use case.
 *
 * The repo enforces workspace isolation via the WHERE clause; the use case
 * is a thin pass-through that returns whether a row was actually removed.
 * Cross-workspace delete returns false and leaves the row intact.
 */

import { deleteBudgetUseCase } from "@/lib/budgeting";
import { describe, expect, test } from "bun:test";
import { InMemoryBudgetRepository } from "./fakes/in-memory-budget.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "22222222-3333-4444-5555-666666666666";

describe("deleteBudgetUseCase", () => {
    test("removes a row in the caller's workspace and returns true", async () => {
        const repo = new InMemoryBudgetRepository();
        const seeded = await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            amountUsd: "100",
            mode: "block",
        });

        const ok = await deleteBudgetUseCase({
            id: seeded.id,
            workspaceId: WORKSPACE_A,
            budgets: repo,
        });

        expect(ok).toBe(true);
        const after = await repo.listByWorkspace(WORKSPACE_A);
        expect(after.length).toBe(0);
    });

    test("returns false and leaves the row intact when called from another workspace", async () => {
        const repo = new InMemoryBudgetRepository();
        const seeded = await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            amountUsd: "100",
            mode: "block",
        });

        const ok = await deleteBudgetUseCase({
            id: seeded.id,
            workspaceId: WORKSPACE_B,
            budgets: repo,
        });

        expect(ok).toBe(false);
        const stillThere = await repo.listByWorkspace(WORKSPACE_A);
        expect(stillThere.length).toBe(1);
    });

    test("returns false on unknown id", async () => {
        const repo = new InMemoryBudgetRepository();
        const ok = await deleteBudgetUseCase({
            id: "00000000-0000-0000-0000-000000000000",
            workspaceId: WORKSPACE_A,
            budgets: repo,
        });
        expect(ok).toBe(false);
    });
});
