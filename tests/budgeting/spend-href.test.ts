/**
 * Tests for the shared `buildBudgetSpendHref` URL builder.
 *
 * Both the budget list row and the budget detail view link "View in spend"
 * with the same query shape: period bounds + scope filter (when non-workspace).
 * Extracting the builder keeps the two surfaces identical.
 */

import type { RawBudget } from "@/lib/budgeting/budget.repository";
import type { BudgetStats } from "@/lib/budgeting/server";
import { buildBudgetSpendHref } from "@/lib/budgeting/spend-href";
import { describe, expect, test } from "bun:test";

const WORKSPACE = "ws-A";

const budget = (overrides: Partial<RawBudget> = {}): RawBudget =>
    ({
        id: "b-1",
        workspaceId: WORKSPACE,
        scopeType: "workspace",
        scopeId: null,
        period: "monthly",
        amountUsd: "100",
        mode: "block",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        updatedAt: new Date("2025-01-01T00:00:00.000Z"),
        ...overrides,
    }) as RawBudget;

const stats = (overrides: Partial<BudgetStats> = {}): BudgetStats => ({
    usedUsd: 0,
    calls: 0,
    tokens: 0,
    topModel: null,
    periodFromIso: "2025-01-01T00:00:00.000Z",
    periodToIso: "2025-02-01T00:00:00.000Z",
    currentlyBlocking: false,
    firstTrippedAt: null,
    crossingCountThisPeriod: 0,
    ...overrides,
});

describe("buildBudgetSpendHref", () => {
    test("workspace-scope budget omits the scope query param", () => {
        const href = buildBudgetSpendHref(WORKSPACE, budget(), stats());
        expect(href).toContain(`/workspace/${WORKSPACE}/spend`);
        expect(href).not.toContain("workspace_id=");
        expect(href).not.toContain("scope_id=");
    });

    test("tenant-scope budget appends `tenant_id=<scopeId>`", () => {
        const href = buildBudgetSpendHref(
            WORKSPACE,
            budget({ scopeType: "tenant", scopeId: "acme" }),
            stats(),
        );
        expect(href).toContain("tenant_id=acme");
    });

    test("agent-scope budget appends `agent_id=<scopeId>`", () => {
        const href = buildBudgetSpendHref(
            WORKSPACE,
            budget({ scopeType: "agent", scopeId: "agent-X" }),
            stats(),
        );
        expect(href).toContain("agent_id=agent-X");
    });

    test("includes from/to query params when stats is provided", () => {
        const href = buildBudgetSpendHref(WORKSPACE, budget(), stats());
        expect(href).toContain(`from=${encodeURIComponent("2025-01-01T00:00:00.000Z")}`);
        expect(href).toContain(`to=${encodeURIComponent("2025-02-01T00:00:00.000Z")}`);
    });

    test("omits from/to when stats is undefined (list-row pending state)", () => {
        const href = buildBudgetSpendHref(WORKSPACE, budget(), undefined);
        expect(href).toContain(`/workspace/${WORKSPACE}/spend`);
        expect(href).not.toContain("from=");
        expect(href).not.toContain("to=");
    });
});
