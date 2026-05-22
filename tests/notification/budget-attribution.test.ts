/**
 * Tests for the budget-attribution formatter.
 *
 * Same helper renders the line for the bell body, the webhook body, and
 * the email body.
 */

import type { BudgetAlertRaisedEvent } from "@/lib/event-bus";
import { formatBudgetAttribution } from "@/lib/notification/budget-attribution";
import { describe, expect, test } from "bun:test";

const budgetEvent: BudgetAlertRaisedEvent = {
    kind: "budget",
    alertId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    workspaceId: "ws-1",
    budgetId: "b-99",
    scopeType: "tenant",
    scopeId: "acme",
    period: "monthly",
    periodFrom: new Date("2026-05-01T00:00:00Z"),
    mode: "block",
    used: 75,
    limit: 50,
    pctOver: 50,
    severity: "critical",
    raisedAt: new Date("2026-05-13T12:00:00Z"),
};

describe("formatBudgetAttribution", () => {
    test("renders scope, spend, cap, and period suffix", () => {
        const line = formatBudgetAttribution(budgetEvent);
        expect(line).toContain("tenant:acme");
        expect(line).toContain("$75.00");
        expect(line).toContain("$50.00");
        expect(line).toContain("/mo cap");
        // No em dashes in user-facing copy.
        expect(line).not.toContain("—");
    });

    test("appends 'N calls denied since trip' when deniedSinceTrip is positive", () => {
        const line = formatBudgetAttribution(budgetEvent, 42);
        expect(line).toContain("42 calls denied since trip");
        expect(line).not.toContain("—");
    });

    test("singular form when deniedSinceTrip = 1", () => {
        const line = formatBudgetAttribution(budgetEvent, 1);
        expect(line).toContain("1 call denied since trip");
    });

    test("omits denial line when deniedSinceTrip is 0 or undefined", () => {
        expect(formatBudgetAttribution(budgetEvent)).not.toContain("denied");
        expect(formatBudgetAttribution(budgetEvent, 0)).not.toContain("denied");
    });
});
