/**
 * Tests for BudgetInputSchema — the single Zod source of truth for budget
 * dashboard input validation. Both createBudget and updateBudget consume it.
 *
 * The schema validates scopeType, scopeId, period, mode, amountUsd. The
 * scope pair-check (workspace → scopeId null; tenant/agent/workflow →
 * non-empty scopeId) is enforced as a cross-field refinement that reports
 * the issue on `path: ["scopeId"]`.
 */

import { BudgetInputSchema } from "@/lib/budgeting/budget-input.schema";
import { describe, expect, test } from "bun:test";

describe("BudgetInputSchema", () => {
    test("accepts a valid workspace-scoped input", () => {
        const result = BudgetInputSchema.safeParse({
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            mode: "block",
            amountUsd: "100",
        });
        expect(result.success).toBe(true);
    });

    test("accepts a valid tenant-scoped input", () => {
        const result = BudgetInputSchema.safeParse({
            scopeType: "tenant",
            scopeId: "acme",
            period: "monthly",
            mode: "notify",
            amountUsd: "10.50",
        });
        expect(result.success).toBe(true);
    });

    test("rejects unknown scopeType with issue on scopeType path", () => {
        const result = BudgetInputSchema.safeParse({
            scopeType: "team",
            scopeId: "x",
            period: "daily",
            mode: "block",
            amountUsd: "10",
        });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.issues.some((i) => i.path[0] === "scopeType")).toBe(true);
    });

    test("rejects unknown period with issue on period path", () => {
        const result = BudgetInputSchema.safeParse({
            scopeType: "workspace",
            scopeId: null,
            period: "yearly",
            mode: "block",
            amountUsd: "10",
        });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.issues.some((i) => i.path[0] === "period")).toBe(true);
    });

    test("rejects unknown mode with issue on mode path", () => {
        const result = BudgetInputSchema.safeParse({
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            mode: "shrug",
            amountUsd: "10",
        });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.issues.some((i) => i.path[0] === "mode")).toBe(true);
    });

    test("rejects negative amountUsd with issue on amountUsd path", () => {
        const result = BudgetInputSchema.safeParse({
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            mode: "block",
            amountUsd: "-1",
        });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.issues.some((i) => i.path[0] === "amountUsd")).toBe(true);
    });

    test("rejects non-numeric amountUsd with issue on amountUsd path", () => {
        const result = BudgetInputSchema.safeParse({
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            mode: "block",
            amountUsd: "abc",
        });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.issues.some((i) => i.path[0] === "amountUsd")).toBe(true);
    });

    test("rejects workspace scope with non-null scopeId on scopeId path", () => {
        const result = BudgetInputSchema.safeParse({
            scopeType: "workspace",
            scopeId: "acme",
            period: "daily",
            mode: "block",
            amountUsd: "10",
        });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.issues.some((i) => i.path[0] === "scopeId")).toBe(true);
    });

    test("rejects tenant/agent/workflow scope with empty scopeId on scopeId path", () => {
        for (const scopeType of ["tenant", "agent", "workflow"] as const) {
            const result = BudgetInputSchema.safeParse({
                scopeType,
                scopeId: "",
                period: "daily",
                mode: "block",
                amountUsd: "10",
            });
            expect(result.success).toBe(false);
            if (result.success) continue;
            expect(result.error.issues.some((i) => i.path[0] === "scopeId")).toBe(true);
        }
    });

    test("rejects tenant/agent/workflow scope with null scopeId on scopeId path", () => {
        const result = BudgetInputSchema.safeParse({
            scopeType: "agent",
            scopeId: null,
            period: "daily",
            mode: "block",
            amountUsd: "10",
        });
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.issues.some((i) => i.path[0] === "scopeId")).toBe(true);
    });
});
