/**
 * Tests for the createBudget use case.
 *
 * The use case validates input before passing to the repo. Validation lives
 * here because the dashboard form is the only ingress; the SDK only reads
 * decisions, never writes budget rows.
 *
 * Validated invariants:
 *   - amountUsd: parses to a finite, non-negative number.
 *   - scopeType ∈ {workspace, tenant, agent, workflow}.
 *   - period ∈ {daily, weekly, monthly}.
 *   - mode ∈ {notify, throttle, block}.
 *   - workspace scope: scopeId MUST be null.
 *   - tenant/agent/workflow scope: scopeId MUST be a non-empty string.
 *
 * Invalid inputs throw a `ValidationError` carrying a stable `field` so the
 * server action can surface friendly messages back to the form.
 */

import { createBudgetUseCase, ValidationError } from "@/lib/budgeting";
import { describe, expect, test } from "bun:test";
import { InMemoryBudgetRepository } from "./fakes/in-memory-budget.repository";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

describe("createBudgetUseCase", () => {
    test("persists a workspace-scoped budget with valid input", async () => {
        const repo = new InMemoryBudgetRepository();

        const created = await createBudgetUseCase({
            workspaceId: WORKSPACE,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            amountUsd: "100",
            mode: "block",
            budgets: repo,
        });

        expect(created.id).toBeDefined();
        expect(created.workspaceId).toBe(WORKSPACE);
        expect(created.scopeType).toBe("workspace");
        expect(created.scopeId).toBeNull();
        expect(created.amountUsd).toBe("100");
        expect(created.mode).toBe("block");
    });

    test("persists a tenant-scoped budget when scopeId is non-empty", async () => {
        const repo = new InMemoryBudgetRepository();
        const created = await createBudgetUseCase({
            workspaceId: WORKSPACE,
            scopeType: "tenant",
            scopeId: "acme",
            period: "monthly",
            amountUsd: "10.50",
            mode: "notify",
            budgets: repo,
        });
        expect(created.scopeType).toBe("tenant");
        expect(created.scopeId).toBe("acme");
    });

    test("rejects negative amountUsd with ValidationError on field 'amountUsd'", async () => {
        const repo = new InMemoryBudgetRepository();
        let err: unknown = null;
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
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).field).toBe("amountUsd");
    });

    test("rejects non-numeric amountUsd", async () => {
        const repo = new InMemoryBudgetRepository();
        let err: unknown = null;
        try {
            await createBudgetUseCase({
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "abc",
                mode: "block",
                budgets: repo,
            });
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).field).toBe("amountUsd");
    });

    test("rejects unknown scopeType", async () => {
        const repo = new InMemoryBudgetRepository();
        let err: unknown = null;
        try {
            await createBudgetUseCase({
                workspaceId: WORKSPACE,
                // @ts-expect-error testing runtime guard against unknown enum
                scopeType: "team",
                scopeId: "x",
                period: "daily",
                amountUsd: "10",
                mode: "block",
                budgets: repo,
            });
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).field).toBe("scopeType");
    });

    test("rejects unknown period", async () => {
        const repo = new InMemoryBudgetRepository();
        let err: unknown = null;
        try {
            await createBudgetUseCase({
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                // @ts-expect-error testing runtime guard against unknown enum
                period: "yearly",
                amountUsd: "10",
                mode: "block",
                budgets: repo,
            });
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).field).toBe("period");
    });

    test("rejects unknown mode", async () => {
        const repo = new InMemoryBudgetRepository();
        let err: unknown = null;
        try {
            await createBudgetUseCase({
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "10",
                // @ts-expect-error testing runtime guard against unknown enum
                mode: "shrug",
                budgets: repo,
            });
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).field).toBe("mode");
    });

    test("rejects workspace scope with non-null scopeId", async () => {
        const repo = new InMemoryBudgetRepository();
        let err: unknown = null;
        try {
            await createBudgetUseCase({
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: "acme",
                period: "daily",
                amountUsd: "10",
                mode: "block",
                budgets: repo,
            });
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).field).toBe("scopeId");
    });

    test("rejects tenant/agent/workflow scope with empty scopeId", async () => {
        const repo = new InMemoryBudgetRepository();
        for (const scopeType of ["tenant", "agent", "workflow"] as const) {
            let err: unknown = null;
            try {
                await createBudgetUseCase({
                    workspaceId: WORKSPACE,
                    scopeType,
                    scopeId: "",
                    period: "daily",
                    amountUsd: "10",
                    mode: "block",
                    budgets: repo,
                });
            } catch (e) {
                err = e;
            }
            expect(err).toBeInstanceOf(ValidationError);
            expect((err as ValidationError).field).toBe("scopeId");
        }
    });

    test("rejects tenant/agent/workflow scope with null scopeId", async () => {
        const repo = new InMemoryBudgetRepository();
        let err: unknown = null;
        try {
            await createBudgetUseCase({
                workspaceId: WORKSPACE,
                scopeType: "agent",
                scopeId: null,
                period: "daily",
                amountUsd: "10",
                mode: "block",
                budgets: repo,
            });
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).field).toBe("scopeId");
    });
});
