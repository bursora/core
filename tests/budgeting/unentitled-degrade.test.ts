/**
 * Lapsed cloud subscriptions degrade budget enforcement gracefully.
 *
 * `decideBudget` (composition root) resolves whether the workspace is entitled
 * (`cloudWorkspaceUnentitled`). An unentitled cloud workspace — owner's
 * subscription lapsed out of {active, past_due, unpaid} — keeps ingesting but
 * loses paid enforcement: a `block` decision lifts to allow+notify and no
 * blocked usage row is stamped (same path admin-owned workspaces take). An
 * entitled workspace keeps the normal block + blocked-row write. Both run
 * against injected fakes via `setBudgetingDepsForTesting` — no DB, no resolver.
 *
 * Self-host and admin-owned cases are covered by the entitlement helper's own
 * suite; here `cloudWorkspaceUnentitled` is injected directly so this suite
 * stays focused on the decide path.
 */

import type { BudgetRepository, RawBudget, SpendAggregator } from "@/lib/budgeting";
import { decideBudget, setBudgetingDepsForTesting } from "@/lib/budgeting/server";
import { afterEach, describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

// A block-mode budget with $10 cap; the aggregator reports $25 spent, so it
// would deny an entitled workspace.
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

const setup = (unentitled: boolean): { blockedCount: () => number } => {
    let blocked = 0;
    setBudgetingDepsForTesting({
        budgets: new FakeBudgetRepo(),
        spend: new FakeAggregator(),
        now: () => new Date("2025-05-10T12:00:00.000Z"),
        recordBlocked: async () => {
            blocked += 1;
        },
        isAdminOwnedWorkspace: async () => false,
        cloudWorkspaceUnentitled: async () => unentitled,
    });
    return { blockedCount: () => blocked };
};

afterEach(() => {
    setBudgetingDepsForTesting(null);
});

describe("decideBudget — lapsed cloud subscription degrade", () => {
    test("unentitled workspace is allowed past a block budget, with no blocked row", async () => {
        const { blockedCount } = setup(true);

        const decision = await decideBudget(decideInput);

        expect(decision.allow).toBe(true);
        expect(decision.mode).toBe("notify");
        expect(blockedCount()).toBe(0);
    });

    test("entitled workspace still blocks and records a blocked row", async () => {
        const { blockedCount } = setup(false);

        const decision = await decideBudget(decideInput);
        await new Promise((resolve) => setImmediate(resolve));

        expect(decision.allow).toBe(false);
        expect(decision.mode).toBe("block");
        expect(blockedCount()).toBe(1);
    });
});
