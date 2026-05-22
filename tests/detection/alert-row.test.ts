/**
 * Tests for the pure row→Alert mapper used by the drizzle alert repo.
 *
 * Two row shapes land in `alerts`:
 *   - anomaly: scope_type ∈ {workspace, tenant, agent}, plaintext reason,
 *     window_cost_usd may be set.
 *   - budget: scope_type = 'budget', reason is JSON `BudgetCrossingPayload`,
 *     period_from is set, window_cost_usd is null.
 *
 * The mapper returns a discriminated union so dashboard consumers branch on
 * `kind` instead of crashing on unexpected shapes.
 */

import type { BudgetAlert } from "@/lib/detection/alert";
import { budgetAlertToEvent, rowToAlert, type AlertRow } from "@/lib/detection/alert-row";
import type { BudgetCrossingPayload } from "@/lib/detection/alert.repository";
import { describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const RAISED = new Date("2025-05-10T12:00:00Z");

const anomalyRow = (overrides: Partial<AlertRow> = {}): AlertRow => ({
    workspaceId: WORKSPACE,
    kind: "anomaly",
    scopeType: "workspace",
    scopeId: null,
    reason: "spike vs baseline",
    deviation: "4.5",
    severity: "warning",
    periodFrom: null,
    raisedAt: RAISED,
    windowCostUsd: "0.42",
    ...overrides,
});

const budgetPayload: BudgetCrossingPayload = {
    reason: "tenant:acme:over:75.00/50.00",
    scopeType: "tenant",
    scopeId: "acme",
    period: "monthly",
    mode: "block",
    used: 75,
    limit: 50,
};

const budgetRow = (overrides: Partial<AlertRow> = {}): AlertRow => ({
    workspaceId: WORKSPACE,
    kind: "budget",
    scopeType: "budget",
    scopeId: "budget-123",
    reason: JSON.stringify(budgetPayload),
    deviation: "50.0",
    severity: "critical",
    periodFrom: new Date("2025-05-01T00:00:00Z"),
    raisedAt: RAISED,
    windowCostUsd: null,
    ...overrides,
});

describe("rowToAlert", () => {
    test("anomaly row maps to anomaly variant with scope and window", () => {
        const result = rowToAlert(anomalyRow({ scopeType: "tenant", scopeId: "acme" }));
        if (result === null || result.kind !== "anomaly") throw new Error("expected anomaly");
        expect(result.scope).toEqual({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: null,
        });
        expect(result.reason).toBe("spike vs baseline");
        expect(result.deviation).toBe(4.5);
        expect(result.severity).toBe("warning");
        expect(result.windowCostUsd).toBe(0.42);
        expect(result.windowStart).toEqual(RAISED);
        expect(result.windowEnd).toEqual(new Date(RAISED.getTime() + 5 * 60_000));
    });

    test("anomaly row with null window_cost_usd preserves null", () => {
        const result = rowToAlert(anomalyRow({ windowCostUsd: null }));
        if (result === null || result.kind !== "anomaly") throw new Error("expected anomaly");
        expect(result.windowCostUsd).toBeNull();
    });

    test("budget row maps to budget variant with parsed payload", () => {
        const result = rowToAlert(budgetRow());
        if (result === null || result.kind !== "budget") throw new Error("expected budget");
        expect(result.workspaceId).toBe(WORKSPACE);
        expect(result.budgetId).toBe("budget-123");
        expect(result.severity).toBe("critical");
        expect(result.raisedAt).toEqual(RAISED);
        expect(result.periodFrom).toEqual(new Date("2025-05-01T00:00:00Z"));
        expect(result.pctOver).toBe(50);
        expect(result.payload).toEqual(budgetPayload);
    });

    test("budget row with agent scope preserves payload scope", () => {
        const agentPayload: BudgetCrossingPayload = {
            ...budgetPayload,
            scopeType: "agent",
            scopeId: "agent-x",
        };
        const result = rowToAlert(budgetRow({ reason: JSON.stringify(agentPayload) }));
        if (result === null || result.kind !== "budget") throw new Error("expected budget");
        expect(result.payload.scopeType).toBe("agent");
        expect(result.payload.scopeId).toBe("agent-x");
    });

    test("workspace-scoped budget row preserves null scopeId in payload", () => {
        const workspacePayload: BudgetCrossingPayload = {
            ...budgetPayload,
            scopeType: "workspace",
            scopeId: null,
        };
        const result = rowToAlert(budgetRow({ reason: JSON.stringify(workspacePayload) }));
        if (result === null || result.kind !== "budget") throw new Error("expected budget");
        expect(result.payload.scopeType).toBe("workspace");
        expect(result.payload.scopeId).toBeNull();
    });

    test("unknown kind throws", () => {
        expect(() => rowToAlert(anomalyRow({ kind: "bogus" }))).toThrow();
    });

    test("malformed budget JSON skips the row", () => {
        const row = budgetRow({ reason: "{ not json" });
        expect(rowToAlert(row)).toBeNull();
    });
});

describe("budgetAlertToEvent", () => {
    function asBudget(row: AlertRow): BudgetAlert {
        const result = rowToAlert(row);
        if (result === null || result.kind !== "budget") throw new Error("expected budget");
        return result;
    }

    test("projects a stored BudgetAlert into a BudgetAlertRaisedEvent for the attribution formatter", () => {
        const alert = asBudget(budgetRow());
        const event = budgetAlertToEvent(alert);
        expect(event.kind).toBe("budget");
        expect(event.workspaceId).toBe(WORKSPACE);
        expect(event.budgetId).toBe("budget-123");
        expect(event.scopeType).toBe("tenant");
        expect(event.scopeId).toBe("acme");
        expect(event.period).toBe("monthly");
        expect(event.mode).toBe("block");
        expect(event.used).toBe(75);
        expect(event.limit).toBe(50);
        expect(event.pctOver).toBe(50);
        expect(event.severity).toBe("critical");
        expect(event.periodFrom).toEqual(new Date("2025-05-01T00:00:00Z"));
        expect(event.raisedAt).toEqual(RAISED);
    });

    test("alertId is the stored alert's budgetId so attribution stays stable", () => {
        const alert = asBudget(budgetRow());
        const event = budgetAlertToEvent(alert);
        // The stored BudgetAlert does not carry the alert row's UUID; the event
        // shape requires SOME alertId. Tying it to budgetId is documented and
        // stable across the dashboard's lifetime.
        expect(event.alertId).toBe(alert.budgetId);
    });
});
