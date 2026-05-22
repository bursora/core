/**
 * Tests for `recordBlockedWithRetry`.
 *
 * The blocked-row writer's FK on `decided_by_budget_id → budgets(id)` can
 * fail when the deciding budget is deleted between decide and write. Without
 * a retry, the entire denial row is lost and the dashboard under-counts
 * blocks. The retry inserts a second time with the FK column set to `null`
 * so the row still lands.
 */

import {
    recordBlockedWithRetry,
    type BlockedRowPayload,
} from "@/lib/budgeting/record-blocked-with-retry";
import { describe, expect, test } from "bun:test";

const PAYLOAD: BlockedRowPayload = {
    workspaceId: "ws-1",
    tenantId: "t-1",
    agentId: null,
    workflowId: null,
    ts: new Date("2025-05-10T10:00:00Z"),
    decidedByBudgetId: "budget-1",
    intendedProvider: "openai",
    intendedModel: "gpt-4o",
    blockReason: "tenant:t-1:over:1.8/2",
};

describe("recordBlockedWithRetry", () => {
    test("inserts once when the first attempt succeeds", async () => {
        const calls: BlockedRowPayload[] = [];
        await recordBlockedWithRetry(async (p) => {
            calls.push(p);
        }, PAYLOAD);

        expect(calls).toHaveLength(1);
        expect(calls[0]?.decidedByBudgetId).toBe("budget-1");
    });

    test("retries with decidedByBudgetId=null when the first attempt throws FK violation", async () => {
        const calls: BlockedRowPayload[] = [];
        await recordBlockedWithRetry(async (p) => {
            calls.push(p);
            if (calls.length === 1) {
                throw Object.assign(new Error("FK"), { code: "23503" });
            }
        }, PAYLOAD);

        expect(calls).toHaveLength(2);
        expect(calls[0]?.decidedByBudgetId).toBe("budget-1");
        expect(calls[1]?.decidedByBudgetId).toBeNull();
        expect(calls[1]?.workspaceId).toBe("ws-1");
        expect(calls[1]?.ts).toEqual(PAYLOAD.ts);
    });

    test("rethrows when both FK retries fail (caller logs)", async () => {
        let attempts = 0;
        let caught: unknown = null;
        try {
            await recordBlockedWithRetry(async () => {
                attempts++;
                throw Object.assign(new Error("foreign key violation"), { code: "23503" });
            }, PAYLOAD);
        } catch (err) {
            caught = err;
        }

        expect(attempts).toBe(2);
        expect((caught as Error)?.message).toBe("foreign key violation");
    });

    test("rethrows non-FK errors on first attempt (no retry)", async () => {
        let attempts = 0;
        let caught: unknown = null;
        try {
            await recordBlockedWithRetry(async () => {
                attempts++;
                throw Object.assign(new Error("db down"), { code: "57P01" });
            }, PAYLOAD);
        } catch (err) {
            caught = err;
        }

        expect(attempts).toBe(1);
        expect((caught as Error)?.message).toBe("db down");
    });
});
