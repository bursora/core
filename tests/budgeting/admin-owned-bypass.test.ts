/**
 * Admin-owned workspaces bypass the budget block.
 *
 * `decideBudget` (composition root) resolves whether the workspace is
 * admin-owned and, if so, lifts a block decision to allow (mode `notify`) and
 * skips stamping the blocked usage row. A non-admin-owned workspace keeps the
 * normal block + blocked-row write. Both paths run against injected fakes via
 * `setBudgetingDepsForTesting` — no DB, no resolver query.
 */

import type { BudgetRepository, RawBudget, SpendAggregator } from "@/lib/budgeting";
import { decideBudget, setBudgetingDepsForTesting } from "@/lib/budgeting/server";
import { afterEach, describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

// A block-mode budget with $10 cap; the aggregator reports $25 spent, so it
// would deny a non-admin workspace.
const blockBudget: RawBudget = {
    id: "b-ws",
    workspaceId: WORKSPACE,
    scopeType: "workspace",
    scopeId: null,
    period: "daily",
    amountUsd: "10",
    mode: "block",
};

class FakeBudgetRepo implements BudgetRepository {
    async findApplicable(): Promise<readonly RawBudget[]> {
        return [blockBudget];
    }
    async listByWorkspace(): Promise<readonly RawBudget[]> {
        return [blockBudget];
    }
    async findById(): Promise<RawBudget | null> {
        return null;
    }
    async create(): Promise<RawBudget> {
        throw new Error("not used in this test");
    }
    async update(): Promise<RawBudget | null> {
        return null;
    }
    async delete(): Promise<boolean> {
        return false;
    }
}

class FakeAggregator implements SpendAggregator {
    async getSpendForScopePeriod(): Promise<number> {
        return 25;
    }
}

const decideInput = {
    workspaceId: WORKSPACE,
    tenantId: null,
    agentId: null,
    workflowId: null,
};

const setup = (isAdminOwned: boolean): { blockedCount: () => number } => {
    let blocked = 0;
    setBudgetingDepsForTesting({
        budgets: new FakeBudgetRepo(),
        spend: new FakeAggregator(),
        now: () => new Date("2025-05-10T12:00:00.000Z"),
        recordBlocked: async () => {
            blocked += 1;
        },
        isAdminOwnedWorkspace: async () => isAdminOwned,
    });
    return { blockedCount: () => blocked };
};

afterEach(() => {
    setBudgetingDepsForTesting(null);
});

describe("decideBudget — admin-owned bypass", () => {
    test("admin-owned workspace is allowed past a block budget, with no blocked row", async () => {
        const { blockedCount } = setup(true);

        const decision = await decideBudget(decideInput);
        // Let any fire-and-forget recordBlocked settle before asserting.
        await new Promise((resolve) => setImmediate(resolve));

        expect(decision.allow).toBe(true);
        expect(decision.mode).toBe("notify");
        expect(blockedCount()).toBe(0);
    });

    test("non-admin-owned workspace still blocks and records a blocked row", async () => {
        const { blockedCount } = setup(false);

        const decision = await decideBudget(decideInput);
        await new Promise((resolve) => setImmediate(resolve));

        expect(decision.allow).toBe(false);
        expect(decision.mode).toBe("block");
        expect(blockedCount()).toBe(1);
    });
});
