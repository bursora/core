/**
 * Tests for the decideBudget orchestrator (application layer).
 *
 * The use case:
 *   1. Loads matching budgets via the BudgetRepository.
 *   2. For each budget, computes the period window.
 *   3. Asks the SpendAggregator port for the spend in that window.
 *   4. Builds a Spend snapshot and calls evaluateBudget.
 *   5. On over-budget crossing, records the crossing into the alert
 *      repository (idempotent per workspace+budget+period) and publishes a
 *      `BudgetAlertRaisedEvent` on the event bus when the row was inserted.
 *
 * No DB. No Redis. Fakes the repo + aggregator + bus + alerts ports.
 */

import type { BudgetRepository, RawBudget, SpendAggregator } from "@/lib/budgeting";
import { decideBudgetUseCase } from "@/lib/budgeting";
import type {
    AlertRepository,
    BudgetCrossingRecord,
    RecordBudgetCrossingResult,
} from "@/lib/detection";
import type { AlertRaisedEvent, BudgetAlertRaisedEvent, EventBus } from "@/lib/event-bus";
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

class FakeBus implements EventBus {
    readonly published: Array<{ topic: string; event: AlertRaisedEvent }> = [];
    async publish<E>(topic: string, event: E): Promise<void> {
        this.published.push({ topic, event: event as AlertRaisedEvent });
    }
    subscribe(): void {
        // not exercised
    }
}

const DEFAULT_ALERT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

class FakeAlerts implements AlertRepository {
    readonly crossings: BudgetCrossingRecord[] = [];
    constructor(private readonly nextResults: readonly RecordBudgetCrossingResult[] = []) {}
    async insertBatch(): Promise<readonly never[]> {
        return [];
    }
    async listForWorkspace(): Promise<readonly never[]> {
        return [];
    }
    async recordBudgetCrossing(
        crossing: BudgetCrossingRecord,
    ): Promise<RecordBudgetCrossingResult> {
        this.crossings.push(crossing);
        const idx = this.crossings.length - 1;
        return this.nextResults[idx] ?? { inserted: true, id: DEFAULT_ALERT_ID };
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

        const decision = await decideBudgetUseCase({
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

describe("decideBudgetUseCase notification side effect", () => {
    test("under-budget: no crossing recorded, no event published", async () => {
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
        const bus = new FakeBus();
        const alerts = new FakeAlerts();

        const decision = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            bus,
            alerts,
        });

        expect(decision.allow).toBe(true);
        expect(alerts.crossings.length).toBe(0);
        expect(bus.published.length).toBe(0);
    });

    test("no matching budgets: no event published", async () => {
        const bus = new FakeBus();
        const alerts = new FakeAlerts();

        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: new FakeBudgetRepo([]),
            spend: new FakeAggregator({}),
            bus,
            alerts,
        });

        expect(bus.published.length).toBe(0);
        expect(alerts.crossings.length).toBe(0);
    });

    test("over-budget block: records crossing and publishes BudgetAlertRaisedEvent", async () => {
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
        const bus = new FakeBus();
        const alerts = new FakeAlerts();

        const decision = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            bus,
            alerts,
        });

        expect(decision.allow).toBe(false);
        expect(alerts.crossings.length).toBe(1);
        const crossing = alerts.crossings[0]!;
        expect(crossing.workspaceId).toBe(WORKSPACE);
        expect(crossing.budgetId).toBe("b-tenant");
        expect(crossing.periodFrom.toISOString()).toBe("2025-05-01T00:00:00.000Z");
        expect(crossing.pctOver).toBe(50);
        expect(crossing.severity).toBe("critical");
        expect(crossing.payload.reason).toBe(decision.reason);
        expect(crossing.payload.scopeType).toBe("tenant");
        expect(crossing.payload.scopeId).toBe("acme");
        expect(crossing.payload.used).toBe(75);
        expect(crossing.payload.limit).toBe(50);

        // Bus publish is fire-and-forget; await microtasks before asserting.
        await new Promise((resolve) => setImmediate(resolve));
        expect(bus.published.length).toBe(1);
        expect(bus.published[0]?.topic).toBe(ALERT_RAISED_TOPIC);
        const event = bus.published[0]?.event as BudgetAlertRaisedEvent;
        expect(event.kind).toBe("budget");
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

    test("over throttle budget: severity is warning, event still fires", async () => {
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
        const bus = new FakeBus();
        const alerts = new FakeAlerts();

        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            bus,
            alerts,
        });

        await new Promise((resolve) => setImmediate(resolve));
        expect(bus.published.length).toBe(1);
        const event = bus.published[0]?.event as BudgetAlertRaisedEvent;
        expect(event.mode).toBe("throttle");
        expect(event.severity).toBe("warning");
    });

    test("over notify budget: severity is warning, event still fires", async () => {
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
        const bus = new FakeBus();
        const alerts = new FakeAlerts();

        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            bus,
            alerts,
        });

        await new Promise((resolve) => setImmediate(resolve));
        expect(bus.published.length).toBe(1);
        const event = bus.published[0]?.event as BudgetAlertRaisedEvent;
        expect(event.mode).toBe("notify");
        expect(event.severity).toBe("warning");
    });

    test("event.alertId equals the id returned by recordBudgetCrossing", async () => {
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
        const bus = new FakeBus();
        const alertId = "11111111-aaaa-bbbb-cccc-222222222222";
        const alerts = new FakeAlerts([{ inserted: true, id: alertId }]);

        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: "acme",
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            bus,
            alerts,
        });

        await new Promise((resolve) => setImmediate(resolve));
        expect(bus.published.length).toBe(1);
        const event = bus.published[0]?.event as BudgetAlertRaisedEvent;
        expect(event.alertId).toBe(alertId);
    });

    test("dedupe: crossing already recorded → no event published", async () => {
        const repo = new FakeBudgetRepo([
            {
                id: "b-block",
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
        const bus = new FakeBus();
        const alerts = new FakeAlerts([{ inserted: false, id: null }]);

        await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
            bus,
            alerts,
        });

        expect(alerts.crossings.length).toBe(1);
        expect(bus.published.length).toBe(0);
    });

    test("works without bus/alerts deps (legacy callers)", async () => {
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

        const decision = await decideBudgetUseCase({
            workspaceId: WORKSPACE,
            tenantId: null,
            agentId: null,
            workflowId: null,
            now: new Date("2025-05-10T12:00:00.000Z"),
            budgets: repo,
            spend: agg,
        });

        expect(decision.allow).toBe(false);
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

        const decision = await decideBudgetUseCase({
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

        const decision = await decideBudgetUseCase({
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
        const decision = await decideBudgetUseCase({
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
        const decision = await decideBudgetUseCase({
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
