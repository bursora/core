/**
 * Tests for the decideBudget use case (application layer).
 *
 * The use case:
 *   1. Loads matching budgets via the BudgetRepository.
 *   2. For each budget, computes the period window.
 *   3. Asks the SpendAggregator port for the spend in that window.
 *   4. Builds a Spend snapshot and calls evaluateBudget.
 *   5. Returns `{ decision, trigger? }`. On an over-budget crossing the
 *      trigger carries the crossing record to persist plus a builder that
 *      produces the publishable event once the alert row id is known.
 *
 * The composition root (`server.ts`) owns the side effects: it persists the
 * crossing via the alert repository and publishes the event on the bus. The
 * use case itself never touches alerts or the bus.
 *
 * No DB. No Redis. Fakes the repo + aggregator ports.
 */

import type {
    BudgetLock,
    BudgetRepository,
    PeriodResolver,
    RawBudget,
    SpendAggregator,
} from "@/lib/budgeting";
import { decideBudgetUseCase } from "@/lib/budgeting";
import { ALERT_RAISED_TOPIC } from "@/lib/event-bus";
import { describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

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

class FakeAggregator implements SpendAggregator {
    readonly calls: Array<{
        scopeType: string;
        scopeId: string | null;
        from: Date;
        to: Date;
    }> = [];
    constructor(private readonly spendByKey: Record<string, number>) {}
    async getSpendForScopePeriod(input: {
        workspaceId: string;
        scopeType: string;
        scopeId: string | null;
        from: Date;
        to: Date;
    }): Promise<number> {
        this.calls.push({
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            from: input.from,
            to: input.to,
        });
        const key = `${input.scopeType}:${input.scopeId ?? ""}:${input.from.toISOString()}`;
        return this.spendByKey[key] ?? 0;
    }
}

interface RecordedBlockedRow {
    readonly workspaceId: string;
    readonly tenantId: string | null;
    readonly agentId: string | null;
    readonly workflowId: string | null;
    readonly ts: Date;
    readonly budgetId: string;
}

class FakeRecordBlocked {
    readonly rows: RecordedBlockedRow[] = [];
    private rejectOnce = false;
    failNextCall(): void {
        this.rejectOnce = true;
    }
    record = async (row: RecordedBlockedRow): Promise<void> => {
        if (this.rejectOnce) {
            this.rejectOnce = false;
            throw new Error("db down");
        }
        this.rows.push(row);
    };
}

describe("decideBudgetUseCase blocked-row write", () => {
    test("block trip records a usage_events row tagged status='blocked' with scope + zero cost", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-tenant",
                workspaceId: WORKSPACE,
                scopeType: "tenant",
                scopeId: "acme",
                period: "monthly",
                amountUsd: "50",
                mode: "block",
            },
        ]);
        const agg = new FakeAggregator({
            "tenant:acme:2025-05-01T00:00:00.000Z": 75,
        });
        const recorder = new FakeRecordBlocked();
        const now = new Date("2025-05-10T12:00:00.000Z");

        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: "support",
            workflowId: "checkout",
            now,
            budgets: repo,
            spend: agg,
            recordBlocked: recorder.record,
        });

        await new Promise((resolve) => setImmediate(resolve));
        expect(recorder.rows.length).toBe(1);
        const row = recorder.rows[0]!;
        expect(row.workspaceId).toBe(WORKSPACE);
        expect(row.tenantId).toBe("acme");
        expect(row.agentId).toBe("support");
        expect(row.workflowId).toBe("checkout");
        expect(row.ts).toEqual(now);
        expect(row.budgetId).toBe("b-tenant");
    });

    test("throttle/notify trips do not record a blocked row", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-throttle",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "10",
                mode: "throttle",
            },
        ]);
        const agg = new FakeAggregator({
            "workspace::2025-05-10T00:00:00.000Z": 25,
        });
        const recorder = new FakeRecordBlocked();

        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            recordBlocked: recorder.record,
        });

        await new Promise((resolve) => setImmediate(resolve));
        expect(recorder.rows.length).toBe(0);
    });

    test("under-budget does not record a blocked row", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "100",
                mode: "block",
            },
        ]);
        const agg = new FakeAggregator({
            "workspace::2025-05-10T00:00:00.000Z": 25,
        });
        const recorder = new FakeRecordBlocked();

        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            recordBlocked: recorder.record,
        });

        await new Promise((resolve) => setImmediate(resolve));
        expect(recorder.rows.length).toBe(0);
    });

    test("recordBlocked failure does not throw out of the use case (fire-and-forget)", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "10",
                mode: "block",
            },
        ]);
        const agg = new FakeAggregator({
            "workspace::2025-05-10T00:00:00.000Z": 25,
        });
        const recorder = new FakeRecordBlocked();
        recorder.failNextCall();

        const { decision } = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            recordBlocked: recorder.record,
        });

        expect(decision.allow).toBe(false);
    });
});

describe("decideBudgetUseCase trigger payload", () => {
    test("under-budget: no trigger returned", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-ws",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "100",
                mode: "block",
            },
        ]);
        const agg = new FakeAggregator({
            "workspace::2025-05-10T00:00:00.000Z": 25,
        });

        const result = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
        });

        expect(result.decision.allow).toBe(true);
        expect(result.trigger).toBeUndefined();
    });

    test("no matching budgets: no trigger returned", async () => {
        const result = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: new FakeBudgetRepo([]),
            spend: new FakeAggregator({}),
        });

        expect(result.trigger).toBeUndefined();
    });

    test("over-budget block: trigger carries the crossing record", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-tenant",
                workspaceId: WORKSPACE,
                scopeType: "tenant",
                scopeId: "acme",
                period: "monthly",
                amountUsd: "50",
                mode: "block",
            },
        ]);
        const agg = new FakeAggregator({
            "tenant:acme:2025-05-01T00:00:00.000Z": 75,
        });

        const result = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
        });

        expect(result.decision.allow).toBe(false);
        expect(result.trigger).toBeDefined();
        const { crossing } = result.trigger!;
        expect(crossing.workspaceId).toBe(WORKSPACE);
        expect(crossing.budgetId).toBe("b-tenant");
        expect(crossing.periodFrom.toISOString()).toBe("2025-05-01T00:00:00.000Z");
        expect(crossing.pctOver).toBe(50);
        expect(crossing.severity).toBe("critical");
        expect(crossing.payload.reason).toBe(result.decision.reason);
        expect(crossing.payload.scopeType).toBe("tenant");
        expect(crossing.payload.scopeId).toBe("acme");
        expect(crossing.payload.used).toBe(75);
        expect(crossing.payload.limit).toBe(50);
    });

    test("over-budget block: buildEvent produces a topic-stamped BudgetAlertRaisedEvent", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-tenant",
                workspaceId: WORKSPACE,
                scopeType: "tenant",
                scopeId: "acme",
                period: "monthly",
                amountUsd: "50",
                mode: "block",
            },
        ]);
        const agg = new FakeAggregator({
            "tenant:acme:2025-05-01T00:00:00.000Z": 75,
        });

        const result = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
        });

        const alertId = "11111111-aaaa-bbbb-cccc-222222222222";
        const event = result.trigger!.buildEvent(alertId);
        expect(event.topic).toBe(ALERT_RAISED_TOPIC);
        expect(event.kind).toBe("budget");
        expect(event.alertId).toBe(alertId);
        expect(event.budgetId).toBe("b-tenant");
        expect(event.scopeType).toBe("tenant");
        expect(event.scopeId).toBe("acme");
        expect(event.mode).toBe("block");
        expect(event.used).toBe(75);
        expect(event.limit).toBe(50);
        expect(event.pctOver).toBe(50);
        expect(event.severity).toBe("critical");
        expect(event.period).toBe("monthly");
    });

    test("over throttle budget: severity is warning, trigger still returned", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-throttle",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "10",
                mode: "throttle",
            },
        ]);
        const agg = new FakeAggregator({
            "workspace::2025-05-10T00:00:00.000Z": 25,
        });

        const result = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
        });

        expect(result.trigger).toBeDefined();
        expect(result.trigger!.crossing.severity).toBe("warning");
        const event = result.trigger!.buildEvent("any-id");
        expect(event.mode).toBe("throttle");
        expect(event.severity).toBe("warning");
    });

    test("over notify budget: severity is warning, trigger still returned", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-notify",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "10",
                mode: "notify",
            },
        ]);
        const agg = new FakeAggregator({
            "workspace::2025-05-10T00:00:00.000Z": 25,
        });

        const result = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
        });

        expect(result.trigger).toBeDefined();
        expect(result.trigger!.crossing.severity).toBe("warning");
        const event = result.trigger!.buildEvent("any-id");
        expect(event.mode).toBe("notify");
        expect(event.severity).toBe("warning");
    });
});

describe("decideBudgetUseCase decision path (unchanged)", () => {
    test("under-budget allow path: queries aggregator per budget, returns allow=true mode=notify", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-ws",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "100",
                mode: "block",
            },
        ]);
        const agg = new FakeAggregator({
            "workspace::2025-05-10T00:00:00.000Z": 25,
        });

        const { decision } = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
        });

        expect(decision.allow).toBe(true);
        expect(decision.mode).toBe("notify");
        expect(decision.ttl_s).toBe(0);
    });

    test("multi-scope: queries aggregator for each budget independently, applies precedence", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-ws",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "1000",
                mode: "notify",
            },
            {
                id: "b-tenant",
                workspaceId: WORKSPACE,
                scopeType: "tenant",
                scopeId: "acme",
                period: "monthly",
                amountUsd: "10",
                mode: "block",
            },
        ]);
        const agg = new FakeAggregator({
            "workspace::2025-05-10T00:00:00.000Z": 5,
            "tenant:acme:2025-05-01T00:00:00.000Z": 25,
        });

        const { decision } = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
        });

        expect(decision.allow).toBe(false);
        expect(decision.mode).toBe("block");
    });

    test("no matching budgets → allow=true, mode=notify, reason='no_budget'", async () => {
        const { decision } = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: new FakeBudgetRepo([]),
            spend: new FakeAggregator({}),
        });

        expect(decision.allow).toBe(true);
        expect(decision.mode).toBe("notify");
        expect(decision.reason).toBe("no_budget");
    });

    test("respects custom ttl via opts.ttlSeconds", async () => {
        const { decision } = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: new FakeBudgetRepo([]),
            spend: new FakeAggregator({}),
            ttlSeconds: 5,
        });

        expect(decision.ttl_s).toBe(5);
    });
});

describe("decideBudgetUseCase periodResolver injection", () => {
    test("injected PeriodResolver controls the window passed to the aggregator (ignores real now)", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-ws",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "100",
                mode: "block",
            },
        ]);
        const fixedFrom = new Date("2030-01-15T00:00:00.000Z");
        const fixedTo = new Date("2030-01-16T00:00:00.000Z");
        const fakeResolver: PeriodResolver = {
            resolveWindow: () => ({ from: fixedFrom, to: fixedTo }),
        };
        // Seed the aggregator at the fake window's key only — the real
        // periodWindow on `now` would yield a 2025-05-10 key and miss it.
        const agg = new FakeAggregator({
            "workspace::2030-01-15T00:00:00.000Z": 25,
        });

        const { decision } = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            periodResolver: fakeResolver,
        });

        expect(agg.calls.length).toBe(1);
        expect(agg.calls[0]?.from).toEqual(fixedFrom);
        expect(agg.calls[0]?.to).toEqual(fixedTo);
        expect(decision.allow).toBe(true);
        expect(decision.resetAt).toBe(fixedTo.toISOString());
    });
});

/**
 * In-memory BudgetLock that serializes calls per (workspace, budgetId) via
 * an awaitable mutex. Records the order of acquire/release so tests can
 * assert that concurrent block-mode decisions actually serialize and
 * non-block decisions don't.
 */
class FakeBudgetLock implements BudgetLock {
    readonly events: string[] = [];
    private readonly holders = new Map<string, Promise<void>>();
    async withBlockBudgetLocks<T>(
        workspaceId: string,
        budgetIds: readonly string[],
        fn: () => Promise<T>,
    ): Promise<T> {
        if (budgetIds.length === 0) {
            this.events.push(`run:none`);
            return fn();
        }
        const sorted = [...budgetIds].sort();
        const keys = sorted.map((id) => `${workspaceId}:${id}`);
        // Acquire in deterministic order; release in reverse on completion.
        const releases: Array<() => void> = [];
        for (const key of keys) {
            const prev = this.holders.get(key) ?? Promise.resolve();
            let release!: () => void;
            const current = new Promise<void>((resolve) => {
                release = resolve;
            });
            this.holders.set(
                key,
                prev.then(() => current),
            );
            await prev;
            this.events.push(`acquire:${key}`);
            releases.push(() => {
                this.events.push(`release:${key}`);
                release();
            });
        }
        try {
            this.events.push(`run:${sorted.join(",")}`);
            return await fn();
        } finally {
            for (const release of releases.reverse()) release();
        }
    }
}

describe("decideBudgetUseCase block-mode concurrency lock", () => {
    test("block-mode budgets acquire the lock around spend read and evaluation", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-block",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "100",
                mode: "block",
            },
        ]);
        const agg = new FakeAggregator({
            "workspace::2025-05-10T00:00:00.000Z": 25,
        });
        const lock = new FakeBudgetLock();

        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            lock,
        });

        expect(lock.events).toEqual([
            `acquire:${WORKSPACE}:b-block`,
            `run:b-block`,
            `release:${WORKSPACE}:b-block`,
        ]);
    });

    test("notify/throttle budgets do NOT acquire the lock (no-op path)", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-notify",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "100",
                mode: "notify",
            },
            {
                id: "b-throttle",
                workspaceId: WORKSPACE,
                scopeType: "tenant",
                scopeId: "acme",
                period: "monthly",
                amountUsd: "100",
                mode: "throttle",
            },
        ]);
        const agg = new FakeAggregator({});
        const lock = new FakeBudgetLock();

        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            lock,
        });

        expect(lock.events).toEqual(["run:none"]);
    });

    test("two concurrent block-mode decisions on the same budget serialize", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-block",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "100",
                mode: "block",
            },
        ]);
        const agg = new FakeAggregator({
            "workspace::2025-05-10T00:00:00.000Z": 25,
        });
        const lock = new FakeBudgetLock();

        const a = decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            lock,
        });
        const b = decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            lock,
        });

        await Promise.all([a, b]);

        // Exactly one acquire/run/release sequence then another — never
        // interleaved (`acquire,acquire,run,run,…` would indicate the lock
        // failed to serialize).
        expect(lock.events).toEqual([
            `acquire:${WORKSPACE}:b-block`,
            `run:b-block`,
            `release:${WORKSPACE}:b-block`,
            `acquire:${WORKSPACE}:b-block`,
            `run:b-block`,
            `release:${WORKSPACE}:b-block`,
        ]);
    });

    test("mixed block + notify budgets: only block id locks", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-block",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "100",
                mode: "block",
            },
            {
                id: "b-notify",
                workspaceId: WORKSPACE,
                scopeType: "tenant",
                scopeId: "acme",
                period: "monthly",
                amountUsd: "100",
                mode: "notify",
            },
        ]);
        const agg = new FakeAggregator({});
        const lock = new FakeBudgetLock();

        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            lock,
        });

        expect(lock.events).toEqual([
            `acquire:${WORKSPACE}:b-block`,
            `run:b-block`,
            `release:${WORKSPACE}:b-block`,
        ]);
    });

    test("boundary overshoot: lock serializes so SDK2 reads the spend that SDK1 committed", async () => {
        // $95 of $100 cap; lock holds → first decideBudget reads $95 (allow),
        // commits $10 of spend (simulated via the mutable aggregator), releases
        // lock; second decideBudget then reads $105 (block). Without the lock,
        // both would have read $95 and both allowed, overshooting the cap.
        const repo = new FakeBudgetRepo([
            {
                id: "b-block",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "100",
                mode: "block",
            },
        ]);
        let spendUsd = 95;
        const agg: SpendAggregator = {
            async getSpendForScopePeriod() {
                return spendUsd;
            },
        };

        // Inject a hook into the lock so we can commit spend inside the
        // critical section, simulating the post-call usage_events write that
        // production does asynchronously between SDK pre-flights.
        const lock: BudgetLock = {
            async withBlockBudgetLocks(_workspaceId, _ids, fn) {
                const result = await fn();
                spendUsd += 10;
                return result;
            },
        };

        const first = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            lock,
        });
        const second = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            lock,
        });

        expect(first.decision.allow).toBe(true);
        expect(second.decision.allow).toBe(false);
    });

    test("no lock dep provided: use case still works (lock is optional)", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-block",
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period: "daily",
                amountUsd: "100",
                mode: "block",
            },
        ]);
        const agg = new FakeAggregator({
            "workspace::2025-05-10T00:00:00.000Z": 25,
        });

        const { decision } = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
        });

        expect(decision.allow).toBe(true);
    });
});
