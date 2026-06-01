/**
 * Tests for `buildGettingStartedRows` — turns a resolved activation state into
 * the widget's five rows. Asserts labels, done flags, the completion count, and
 * that only todo rows (except the live first-event row) carry a link.
 */

import type { ActivationState } from "@/lib/onboarding/activation-state";
import { buildGettingStartedRows } from "@/lib/onboarding/getting-started-rows";
import { describe, expect, test } from "bun:test";

const WS = "11111111-2222-3333-4444-555555555555";

const FRESH: ActivationState = {
    workspaceCreated: true,
    apiKeyIssued: false,
    firstEventSent: false,
    budgetSet: false,
    teammateInvited: false,
    dismissed: false,
};

describe("buildGettingStartedRows", () => {
    test("counts only the workspace-created row on a fresh workspace", () => {
        const { rows, completed, total } = buildGettingStartedRows(FRESH, WS);
        expect(total).toBe(5);
        expect(completed).toBe(1);
        expect(rows.map((r) => r.key)).toEqual([
            "workspace",
            "api-key",
            "first-event",
            "budget",
            "teammate",
        ]);
    });

    test("todo rows link to their section; done rows do not", () => {
        const { rows } = buildGettingStartedRows(FRESH, WS);
        const hrefOf = (key: string) => rows.find((r) => r.key === key)?.href;
        expect(hrefOf("workspace")).toBeNull();
        expect(hrefOf("api-key")).toContain(`/workspace/${WS}/keys`);
        expect(hrefOf("budget")).toContain(`/workspace/${WS}/budgets`);
        expect(hrefOf("teammate")).toContain(`/workspace/${WS}/members`);
    });

    test("the first-event row is live while todo and never carries a link", () => {
        const { rows } = buildGettingStartedRows(FRESH, WS);
        const firstEvent = rows.find((r) => r.key === "first-event");
        expect(firstEvent?.live).toBe(true);
        expect(firstEvent?.href).toBeNull();
    });

    test("a fully activated workspace reports 5/5 and no links", () => {
        const done: ActivationState = {
            workspaceCreated: true,
            apiKeyIssued: true,
            firstEventSent: true,
            budgetSet: true,
            teammateInvited: true,
            dismissed: false,
        };
        const { rows, completed } = buildGettingStartedRows(done, WS);
        expect(completed).toBe(5);
        expect(rows.every((r) => r.done)).toBe(true);
        expect(rows.every((r) => r.href === null)).toBe(true);
        expect(rows.find((r) => r.key === "first-event")?.live).toBe(false);
    });
});
