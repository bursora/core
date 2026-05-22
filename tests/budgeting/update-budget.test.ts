/**
 * Tests for the updateBudget use case.
 *
 * Workspace isolation: an update for a row owned by another workspace
 * returns null and does not mutate. Validation runs only on fields present
 * in the patch — partial updates are supported.
 */

import { updateBudgetUseCase, ValidationError } from "@/lib/budgeting";
import { describe, expect, test } from "bun:test";
import { InMemoryBudgetRepository } from "./fakes/in-memory-budget.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "22222222-3333-4444-5555-666666666666";

const seedRow = async (repo: InMemoryBudgetRepository, workspaceId: string) =>
    repo.create({
        workspaceId,
        scopeType: "workspace",
        scopeId: null,
        period: "daily",
        amountUsd: "100",
        mode: "block",
    });

describe("updateBudgetUseCase", () => {
    test("updates fields on a row owned by the caller's workspace", async () => {
        const repo = new InMemoryBudgetRepository();
        const seeded = await seedRow(repo, WORKSPACE_A);

        const updated = await updateBudgetUseCase({
            id: seeded.id,
            workspaceId: WORKSPACE_A,
            patch: { amountUsd: "250", mode: "notify" },
            budgets: repo,
        });

        expect(updated).not.toBeNull();
        expect(updated?.amountUsd).toBe("250");
        expect(updated?.mode).toBe("notify");
        expect(updated?.scopeType).toBe("workspace");
        expect(updated?.period).toBe("daily");
    });

    test("returns null when the row belongs to another workspace", async () => {
        const repo = new InMemoryBudgetRepository();
        const seeded = await seedRow(repo, WORKSPACE_A);

        const result = await updateBudgetUseCase({
            id: seeded.id,
            workspaceId: WORKSPACE_B,
            patch: { amountUsd: "999" },
            budgets: repo,
        });

        expect(result).toBeNull();
        const stillThere = await repo.listByWorkspace(WORKSPACE_A);
        expect(stillThere[0]?.amountUsd).toBe("100");
    });

    test("returns null on unknown id", async () => {
        const repo = new InMemoryBudgetRepository();
        const result = await updateBudgetUseCase({
            id: "00000000-0000-0000-0000-000000000000",
            workspaceId: WORKSPACE_A,
            patch: { amountUsd: "1" },
            budgets: repo,
        });
        expect(result).toBeNull();
    });

    test("rejects negative amountUsd", async () => {
        const repo = new InMemoryBudgetRepository();
        const seeded = await seedRow(repo, WORKSPACE_A);
        let err: unknown = null;
        try {
            await updateBudgetUseCase({
                id: seeded.id,
                workspaceId: WORKSPACE_A,
                patch: { amountUsd: "-5" },
                budgets: repo,
            });
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).field).toBe("amountUsd");
    });

    test("rejects unknown enum values in the patch", async () => {
        const repo = new InMemoryBudgetRepository();
        const seeded = await seedRow(repo, WORKSPACE_A);
        let err: unknown = null;
        try {
            await updateBudgetUseCase({
                id: seeded.id,
                workspaceId: WORKSPACE_A,
                // @ts-expect-error testing runtime guard against unknown enum
                patch: { mode: "shrug" },
                budgets: repo,
            });
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).field).toBe("mode");
    });

    test("rejects switching to a tenant scope without a scopeId", async () => {
        const repo = new InMemoryBudgetRepository();
        const seeded = await seedRow(repo, WORKSPACE_A);
        let err: unknown = null;
        try {
            await updateBudgetUseCase({
                id: seeded.id,
                workspaceId: WORKSPACE_A,
                patch: { scopeType: "tenant", scopeId: null },
                budgets: repo,
            });
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).field).toBe("scopeId");
    });
});
