/**
 * Detection feature integration test.
 *
 * Drives the public API exposed by `@/lib/detection` — the surface
 * `app/` and other features depend on. Uses in-memory fakes for the spend
 * source, alert repository, and event bus; lower-level paths are covered in
 * `tests/detection/`.
 *
 * Locks the feature contract: schema re-export, the cron entry calling
 * `insertBatch` (not per-alert insert), parallel notification publishes, and
 * the read-side feed reachable via `listAlertsUseCase`.
 */

import { alerts as alertsTable } from "@/lib/db";
import {
    listAlertsUseCase,
    runAnomalyDetection,
    type Alert,
    type AlertRepository,
    type AnomalyAlert,
    type ScopedSpendSeries,
    type SpendPoint,
    type SpendSeriesSource,
} from "@/lib/detection";
import type { AlertRaisedEvent, EventBus } from "@/lib/event-bus";
import { describe, expect, test } from "bun:test";

const NOW = new Date("2025-05-10T12:00:00Z");

const buildPoints = (costs: readonly number[]): readonly SpendPoint[] =>
    costs.map((costUsd, i) => ({
        ts: new Date(NOW.getTime() - (costs.length - 1 - i) * 5 * 60_000),
        costUsd,
    }));

const baseline = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < 23; i += 1) {
        out.push(0.5 + ((i % 3) - 1) * 0.005);
    }
    return out;
};

class FakeAlertRepo implements AlertRepository {
    readonly inserted: AnomalyAlert[] = [];
    readonly batchCalls: number[] = [];
    private nextId = 0;
    async insertBatch(
        rows: readonly AnomalyAlert[],
    ): Promise<readonly { readonly alert: AnomalyAlert; readonly id: string }[]> {
        this.batchCalls.push(rows.length);
        this.inserted.push(...rows);
        return rows.map((alert) => {
            this.nextId += 1;
            const id = `00000000-0000-0000-0000-${this.nextId.toString(16).padStart(12, "0")}`;
            return { alert, id };
        });
    }
    async recordBudgetCrossing(): Promise<{ inserted: boolean; id: string | null }> {
        return { inserted: false, id: null };
    }
    async listForWorkspace(): Promise<readonly Alert[]> {
        return [...this.inserted].sort((a, b) => b.raisedAt.getTime() - a.raisedAt.getTime());
    }
}

class FakeSpendSource implements SpendSeriesSource {
    constructor(private readonly seriesByScope: readonly ScopedSpendSeries[]) {}
    async listScopedSeries(): Promise<readonly ScopedSpendSeries[]> {
        return this.seriesByScope;
    }
}

class FakeEventBus implements EventBus {
    readonly published: Array<{ topic: string; event: unknown }> = [];
    readonly startOrder: number[] = [];
    private readonly gates: Array<() => void> = [];
    private next = 0;
    gated = false;
    async publish<E>(topic: string, event: E): Promise<void> {
        const id = this.next;
        this.next += 1;
        this.startOrder.push(id);
        if (this.gated) {
            await new Promise<void>((resolve) => {
                this.gates.push(resolve);
            });
        }
        this.published.push({ topic, event });
    }
    pendingCount(): number {
        return this.gates.length;
    }
    releaseAll(): void {
        const queued = this.gates.splice(0);
        for (const g of queued) g();
    }
    subscribe<E>(topic: string, handler: (event: E) => Promise<void> | void): void {
        void topic;
        void handler;
    }
}

describe("@/lib/detection public API", () => {
    test("schema table is re-exported", () => {
        expect(alertsTable).toBeDefined();
    });

    test("cron entry runs detect on seeded series and writes alerts via insertBatch", async () => {
        const series: ScopedSpendSeries[] = [
            {
                scope: { workspaceId: "ws-1", tenantId: "tenant-a", agentId: null },
                points: buildPoints([...baseline(), 2.5]),
            },
            {
                scope: { workspaceId: "ws-1", tenantId: "tenant-b", agentId: null },
                points: buildPoints([...baseline(), 3]),
            },
            {
                scope: { workspaceId: "ws-1", tenantId: "tenant-c", agentId: null },
                points: buildPoints([...baseline(), 0.5]),
            },
        ];
        const repo = new FakeAlertRepo();
        const bus = new FakeEventBus();

        const summary = await runAnomalyDetection({
            now: NOW,
            source: new FakeSpendSource(series),
            alerts: repo,
            bus,
        });

        expect(summary.scopesScanned).toBe(3);
        expect(summary.alertsRaised).toBe(2);
        expect(repo.inserted.length).toBe(2);
        // Single batched call rather than one-insert-per-alert.
        expect(repo.batchCalls).toEqual([2]);
    });

    test("notification publishes are fanned out in parallel", async () => {
        const series: ScopedSpendSeries[] = [
            {
                scope: { workspaceId: "ws-1", tenantId: "tenant-a", agentId: null },
                points: buildPoints([...baseline(), 2.5]),
            },
            {
                scope: { workspaceId: "ws-1", tenantId: "tenant-b", agentId: null },
                points: buildPoints([...baseline(), 3]),
            },
        ];
        const repo = new FakeAlertRepo();
        const bus = new FakeEventBus();
        bus.gated = true;

        const pending = runAnomalyDetection({
            now: NOW,
            source: new FakeSpendSource(series),
            alerts: repo,
            bus,
        });

        // Yield enough microtasks for the orchestrator to enqueue both publishes.
        for (let i = 0; i < 5; i += 1) await Promise.resolve();

        // Parallel: both publishes start (and block on the gate) before any
        // single one resolves. Sequential would only show 1 pending here.
        expect(bus.startOrder).toEqual([0, 1]);
        expect(bus.pendingCount()).toBe(2);

        bus.releaseAll();
        await pending;

        expect(bus.published.length).toBe(2);
        expect(bus.published[0]?.topic).toBe("alert.raised");
        const event = bus.published[0]?.event as AlertRaisedEvent;
        expect(event.workspaceId).toBe("ws-1");
    });

    test("listAlertsUseCase returns persisted alerts newest first", async () => {
        const repo = new FakeAlertRepo();
        const olderTs = new Date(NOW.getTime() - 60 * 60_000);
        const older: AnomalyAlert = {
            kind: "anomaly",
            scope: { workspaceId: "ws-1", tenantId: "tenant-a", agentId: null },
            reason: "older spike",
            deviation: 4,
            severity: "warning",
            raisedAt: olderTs,
            windowStart: olderTs,
            windowEnd: new Date(olderTs.getTime() + 5 * 60_000),
            windowCostUsd: 0.1,
        };
        const newer: AnomalyAlert = {
            kind: "anomaly",
            scope: { workspaceId: "ws-1", tenantId: "tenant-b", agentId: null },
            reason: "newer spike",
            deviation: 5,
            severity: "warning",
            raisedAt: NOW,
            windowStart: NOW,
            windowEnd: new Date(NOW.getTime() + 5 * 60_000),
            windowCostUsd: 0.2,
        };
        await repo.insertBatch([older, newer]);

        const rows = await listAlertsUseCase({
            workspaceId: "ws-1",
            from: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
            alerts: repo,
        });

        expect(rows.length).toBe(2);
        const first = rows[0];
        expect(first?.kind).toBe("anomaly");
        if (first?.kind === "anomaly") {
            expect(first.reason).toBe("newer spike");
        }
    });
});
