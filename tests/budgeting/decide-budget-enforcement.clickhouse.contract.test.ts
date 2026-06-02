/**
 * CH-backed enforcement contract: `decideBudgetUseCase` reading spend directly
 * from ClickHouse via `ClickHouseSpendAggregator`. Run against an ephemeral
 * database carved out of a live ClickHouse (env `CLICKHOUSE_URL`); skips when no
 * live server is configured.
 *
 * Proves the budget preflight enforces on the live windowed `SUM(cost_usd)`:
 *   - ok events summing to S in the current window, cap C → block once S >= C,
 *     allow while S < C (same decisions a Postgres SUM produced).
 *   - a runaway burst: events accumulating across rapid successive preflights
 *     are summed by each later preflight (synchronous insert), so the budget
 *     trips the instant cumulative spend reaches the cap.
 */

import type { Budget } from "@/lib/budgeting/budget";
import type {
    BudgetRepository,
    BudgetScopeQuery,
    CreateBudgetInput,
    RawBudget,
    UpdateBudgetInput,
} from "@/lib/budgeting/budget.repository";
import { ClickHouseSpendAggregator } from "@/lib/budgeting/clickhouse-spend.aggregator";
import { decideBudgetUseCase } from "@/lib/budgeting/decide-budget.usecase";
import { clickHouseRecordBlocked } from "@/lib/budgeting/server";
import { ClickHouseUsageEventRepository } from "@/lib/metering/clickhouse-usage-event.repository";
import { clickHouseSpendRepository } from "@/lib/spend";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
    clickhouseTestConfig,
    createTestClickHouse,
    truncateTables,
    type TestClickHouseHandle,
} from "../support/clickhouse-db";
import { CONTRACT_WORKSPACE, insertUsageEvent } from "../support/clickhouse-usage-events";

const hasClickHouse = clickhouseTestConfig() !== null;

// A wall clock that lands inside the monthly window the events are stamped in.
const NOW = new Date("2026-06-15T12:00:00Z");
const TS = new Date("2026-06-15T08:00:00Z");

/** Budget repo that returns a fixed applicable set, ignoring the scope query. */
class StaticBudgetRepo implements BudgetRepository {
    constructor(private readonly rows: readonly RawBudget[]) {}
    async findApplicable(_query: BudgetScopeQuery): Promise<readonly RawBudget[]> {
        return this.rows;
    }
    async listByWorkspace(): Promise<readonly RawBudget[]> {
        return this.rows;
    }
    async findById(): Promise<RawBudget | null> {
        return null;
    }
    async create(input: CreateBudgetInput): Promise<RawBudget> {
        return { ...input, id: "unused" };
    }
    async update(_id: string, _ws: string, _patch: UpdateBudgetInput): Promise<RawBudget | null> {
        return null;
    }
    async delete(): Promise<boolean> {
        return false;
    }
}

const workspaceBlockBudget = (amountUsd: string): RawBudget => ({
    id: "b-workspace",
    workspaceId: CONTRACT_WORKSPACE,
    scopeType: "workspace",
    scopeId: null,
    period: "monthly" satisfies Budget["period"],
    amountUsd,
    mode: "block",
});

let handle: TestClickHouseHandle;

beforeAll(async () => {
    if (!hasClickHouse) return;
    handle = await createTestClickHouse();
});

afterAll(async () => {
    await handle?.close();
});

beforeEach(async () => {
    if (!hasClickHouse) return;
    await truncateTables(handle.native, handle.database);
});

function decideWorkspaceBudget(cap: string) {
    return decideBudgetUseCase({
        workspaceId: CONTRACT_WORKSPACE,
        tenantId: null,
        agentId: null,
        workflowId: null,
        now: NOW,
        budgets: new StaticBudgetRepo([workspaceBlockBudget(cap)]),
        spend: new ClickHouseSpendAggregator(clickHouseSpendRepository(handle.ch)),
    });
}

describe("decideBudgetUseCase over live ClickHouse spend", () => {
    test.skipIf(!hasClickHouse)("allows while spend is under the cap", async () => {
        await insertUsageEvent(handle.ch, { costUsd: "0.50000000", ts: TS });

        const { decision } = await decideWorkspaceBudget("1.00");

        expect(decision.allow).toBe(true);
    });

    test.skipIf(!hasClickHouse)("blocks once spend reaches the cap", async () => {
        await insertUsageEvent(handle.ch, { costUsd: "0.60000000", ts: TS });
        await insertUsageEvent(handle.ch, { costUsd: "0.40000000", ts: TS });

        const { decision } = await decideWorkspaceBudget("1.00");

        expect(decision.allow).toBe(false);
    });

    test.skipIf(!hasClickHouse)("ignores blocked rows and spend outside the window", async () => {
        // Blocked rows never count toward spend; a row in a prior month is
        // outside the current monthly window.
        await insertUsageEvent(handle.ch, { costUsd: "5.00000000", ts: TS, status: "blocked" });
        await insertUsageEvent(handle.ch, {
            costUsd: "5.00000000",
            ts: new Date("2026-05-31T23:00:00Z"),
        });
        await insertUsageEvent(handle.ch, { costUsd: "0.25000000", ts: TS });

        const { decision } = await decideWorkspaceBudget("1.00");

        expect(decision.allow).toBe(true);
    });

    test.skipIf(!hasClickHouse)(
        "stamps a status='blocked' row through the CH sink when a block budget trips",
        async () => {
            // Budget id must be a real UUID: the blocked-row write lands it in the
            // `decided_by_budget_id UUID` column.
            const budgetId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
            await insertUsageEvent(handle.ch, { costUsd: "1.50000000", ts: TS });

            const sink = clickHouseRecordBlocked(new ClickHouseUsageEventRepository(handle.ch));
            let written: Promise<void> | undefined;
            const { decision } = await decideBudgetUseCase({
                workspaceId: CONTRACT_WORKSPACE,
                tenantId: null,
                agentId: null,
                workflowId: null,
                now: NOW,
                intendedProvider: "openai",
                intendedModel: "gpt-4o",
                budgets: new StaticBudgetRepo([{ ...workspaceBlockBudget("1.00"), id: budgetId }]),
                spend: new ClickHouseSpendAggregator(clickHouseSpendRepository(handle.ch)),
                recordBlocked: (row) => (written = sink(row)),
            });

            expect(decision.allow).toBe(false);
            // recordBlocked is fire-and-forget; await the captured write so the
            // row is durable before reading it back (synchronous insert).
            await written;

            const rows = await handle.ch.query<{ n: string; budget: string | null }>({
                query: `SELECT count() AS n, any(decided_by_budget_id) AS budget
                        FROM usage_events
                        WHERE workspace_id = toUUID({ws:String}) AND status = 'blocked'`,
                query_params: { ws: CONTRACT_WORKSPACE },
            });

            expect(Number(rows[0]?.n)).toBe(1);
            expect(rows[0]?.budget).toBe(budgetId);
        },
    );

    test.skipIf(!hasClickHouse)(
        "runaway burst: each preflight sees the accumulating live sum and trips at the cap",
        async () => {
            const decisions: boolean[] = [];
            // Five rapid calls, each adding $0.30 before its own preflight. The
            // cap is $1.00, so cumulative spend crosses it on the fourth call.
            for (let i = 0; i < 5; i++) {
                await insertUsageEvent(handle.ch, { costUsd: "0.30000000", ts: TS });
                const { decision } = await decideWorkspaceBudget("1.00");
                decisions.push(decision.allow);
            }

            // 0.30, 0.60, 0.90 → allow; 1.20, 1.50 → block.
            expect(decisions).toEqual([true, true, true, false, false]);
        },
    );
});
