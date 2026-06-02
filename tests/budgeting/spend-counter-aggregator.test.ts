/**
 * Tests for the counter-backed budget read path (slice #146).
 *
 * Two seams:
 *   1. `SpendCounterAggregator` adapts the `SpendCounter` read model to the
 *      `SpendAggregator` port `decideBudget` depends on. The budget preflight
 *      reads the running Redis spend counter (reconciled from ClickHouse on a
 *      miss) instead of a Postgres `SUM(cost_usd)`. The pure `evaluateBudget`
 *      decision logic is unchanged — these tests assert the decision a
 *      counter-backed read produces matches `evaluateBudget` on the same total,
 *      and that the counter is read with the EXACT key coordinates the ingest
 *      path increments (scope + period + the current window's `now`).
 *   2. `clickHouseRecordBlocked` stamps a `status='blocked'` usage event into
 *      ClickHouse via the shared `UsageEventRepository`. A block trip writes
 *      one row; throttle/notify/under do not.
 *
 * No DB, no Redis, no ClickHouse. Fakes the counter + the usage-event repo.
 */

import type { BudgetRepository, RawBudget } from "@/lib/budgeting";
import { decideBudgetUseCase, evaluateBudget } from "@/lib/budgeting";
import { clickHouseRecordBlocked } from "@/lib/budgeting/server";
import { SpendCounterAggregator } from "@/lib/budgeting/spend-counter.aggregator";
import type { UsageEventRow } from "@/lib/metering";
import type { UsageEventRepository } from "@/lib/metering/usage-event.repository";
import type { ReadSpendQuery, SpendCounter } from "@/lib/spend-counter";
import { describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2025-05-10T12:00:00.000Z");

class FakeBudgetRepo implements BudgetRepository {
    constructor(private readonly rows: readonly RawBudget[]) {}
    async findApplicable(): Promise<readonly RawBudget[]> {
        return this.rows;
    }
    async listByWorkspace(): Promise<readonly RawBudget[]> {
        return this.rows;
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

class FakeSpendCounter implements SpendCounter {
    readonly reads: ReadSpendQuery[] = [];
    constructor(private readonly total: number) {}
    async record(): Promise<void> {}
    async read(query: ReadSpendQuery): Promise<number> {
        this.reads.push(query);
        return this.total;
    }
}

class FakeUsageEventRepo implements UsageEventRepository {
    readonly batches: UsageEventRow[][] = [];
    async insertBatch(rows: readonly UsageEventRow[]): Promise<number> {
        this.batches.push([...rows]);
        return rows.length;
    }
}

const tenantBlockBudget: RawBudget = {
    id: "b-tenant",
    workspaceId: WORKSPACE,
    scopeType: "tenant",
    scopeId: "acme",
    period: "monthly",
    amountUsd: "50",
    mode: "block",
};

describe("SpendCounterAggregator → decideBudget", () => {
    test("reads the counter with the budget's scope + period + window now", async () => {
        const counter = new FakeSpendCounter(75);
        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: null,
            workflowId: null,
            now: NOW,
            budgets: new FakeBudgetRepo([tenantBlockBudget]),
            spend: new SpendCounterAggregator(counter),
        });

        expect(counter.reads.length).toBe(1);
        expect(counter.reads[0]).toEqual({
            workspaceId: WORKSPACE,
            scopeType: "tenant",
            scopeId: "acme",
            period: "monthly",
            now: NOW,
        });
    });

    test("over the cap blocks; decision matches evaluateBudget on the counter total", async () => {
        const { decision } = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: null,
            workflowId: null,
            now: NOW,
            budgets: new FakeBudgetRepo([tenantBlockBudget]),
            spend: new SpendCounterAggregator(new FakeSpendCounter(75)),
        });

        const expected = evaluateBudget({ get: () => 75 }, [
            {
                ...tenantBlockBudget,
                periodFrom: new Date("2025-05-01T00:00:00.000Z"),
                periodTo: new Date("2025-06-01T00:00:00.000Z"),
            },
        ]);
        expect(decision).toEqual(expected.decision);
        expect(decision.allow).toBe(false);
        expect(decision.mode).toBe("block");
    });

    test("under the cap allows", async () => {
        const { decision } = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: null,
            workflowId: null,
            now: NOW,
            budgets: new FakeBudgetRepo([tenantBlockBudget]),
            spend: new SpendCounterAggregator(new FakeSpendCounter(25)),
        });

        expect(decision.allow).toBe(true);
    });

    test("recovers period + now from the window when not threaded (dashboard path)", async () => {
        const cases: ReadonlyArray<{ from: string; to: string; period: ReadSpendQuery["period"] }> =
            [
                {
                    from: "2025-05-10T00:00:00.000Z",
                    to: "2025-05-11T00:00:00.000Z",
                    period: "daily",
                },
                {
                    from: "2025-05-05T00:00:00.000Z",
                    to: "2025-05-12T00:00:00.000Z",
                    period: "weekly",
                },
                {
                    from: "2025-05-01T00:00:00.000Z",
                    to: "2025-06-01T00:00:00.000Z",
                    period: "monthly",
                },
            ];

        for (const c of cases) {
            const counter = new FakeSpendCounter(10);
            await new SpendCounterAggregator(counter).getSpendForScopePeriod({
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                from: new Date(c.from),
                to: new Date(c.to),
            });
            expect(counter.reads[0]).toEqual({
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: c.period,
                now: new Date(c.from),
            });
        }
    });
});

describe("clickHouseRecordBlocked", () => {
    test("a block trip writes one status='blocked' row to ClickHouse", async () => {
        const repo = new FakeUsageEventRepo();
        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: "support",
            workflowId: "checkout",
            intendedProvider: "openai",
            intendedModel: "gpt-4o",
            now: NOW,
            budgets: new FakeBudgetRepo([tenantBlockBudget]),
            spend: new SpendCounterAggregator(new FakeSpendCounter(75)),
            recordBlocked: clickHouseRecordBlocked(repo),
        });
        await new Promise((resolve) => setImmediate(resolve));

        expect(repo.batches.length).toBe(1);
        const batch = repo.batches[0]!;
        expect(batch.length).toBe(1);
        const row = batch[0]!;
        expect(row.status).toBe("blocked");
        expect(row.costUsd).toBe("0");
        expect(row.workspaceId).toBe(WORKSPACE);
        expect(row.tenantId).toBe("acme");
        expect(row.agentId).toBe("support");
        expect(row.workflowId).toBe("checkout");
        expect(row.provider).toBe("openai");
        expect(row.model).toBe("gpt-4o");
        expect(row.decidedByBudgetId).toBe("b-tenant");
        expect(row.blockReason).toBe("tenant:acme:over:75/50");
        expect(row.ts).toEqual(NOW);
    });

    test("omitted intended provider/model land as empty strings (non-Nullable CH columns)", async () => {
        const repo = new FakeUsageEventRepo();
        await clickHouseRecordBlocked(repo)({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            ts: NOW,
            budgetId: "b-tenant",
            intendedProvider: null,
            intendedModel: null,
            blockReason: "workspace:*:over:1/0",
        });

        const row = repo.batches[0]![0]!;
        expect(row.provider).toBe("");
        expect(row.model).toBe("");
    });

    test("under budget records nothing", async () => {
        const repo = new FakeUsageEventRepo();
        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: null,
            workflowId: null,
            now: NOW,
            budgets: new FakeBudgetRepo([tenantBlockBudget]),
            spend: new SpendCounterAggregator(new FakeSpendCounter(25)),
            recordBlocked: clickHouseRecordBlocked(repo),
        });
        await new Promise((resolve) => setImmediate(resolve));

        expect(repo.batches.length).toBe(0);
    });
});
