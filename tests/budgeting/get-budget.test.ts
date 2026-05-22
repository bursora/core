/**
 * Tests for `getBudgetUseCase` — single-row lookup scoped by workspace.
 *
 * The detail page calls this and triggers `notFound()` when the result is
 * null. Workspace isolation matters: a cross-workspace id MUST return null,
 * not the foreign row.
 */

import { getBudgetUseCase } from "@/lib/budgeting/get-budget.usecase";
import { describe, expect, test } from "bun:test";
import { InMemoryBudgetRepository } from "./fakes/in-memory-budget.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "22222222-3333-4444-5555-666666666666";

describe("getBudgetUseCase", () => {
    test("returns the row when id matches in the caller's workspace", async () => {
        const repo = new InMemoryBudgetRepository();
        const seeded = await repo.create({
            workspaceId: WORKSPACE_A,
            scopeType: "tenant",
            scopeId: "acme",
            period: "daily",
            amountUsd: "100",
            mode: "block",
        });

        const got = await getBudgetUseCase({
            id: seeded.id,
            workspaceId: WORKSPACE_A,
            budgets: repo,
        });

        expect(got?.id).toBe(seeded.id);
        expect(got?.scopeId).toBe("acme");
    });

    test("returns null when the id does not exist", async () => {
        const repo = new InMemoryBudgetRepository();

        const got = await getBudgetUseCase({
            id: "00000000-0000-0000-0000-000000000000",
            workspaceId: WORKSPACE_A,
            budgets: repo,
        });

        expect(got).toBeNull();
    });

    test("returns null when the id belongs to another workspace", async () => {
        const repo = new InMemoryBudgetRepository();
        const seeded = await repo.create({
            workspaceId: WORKSPACE_B,
            scopeType: "workspace",
            scopeId: null,
            period: "monthly",
            amountUsd: "500",
            mode: "notify",
        });

        const got = await getBudgetUseCase({
            id: seeded.id,
            workspaceId: WORKSPACE_A,
            budgets: repo,
        });

        expect(got).toBeNull();
    });
});
