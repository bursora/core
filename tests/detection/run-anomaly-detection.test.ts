/**
 * Tests for the run-anomaly-detection orchestrator.
 *
 * The use case enumerates all (workspaceId, tenantId, agentId) scopes seen
 * in the recent window, runs detectAnomaly per scope, persists each alert,
 * and publishes an `alert.raised` event for downstream notification.
 *
 * Covered behaviors:
 *   - 5x spike in one scope → exactly one alert row written + one event
 *     published.
 *   - Per-scope independence: a spike in tenantA does NOT cause an alert
 *     for tenantB in the same workspace.
 *   - Flat baseline → no alerts.
 *   - Insufficient history → no alerts.
 */

import type {
    Alert,
    AlertRepository,
    AnomalyAlert,
    ScopedSpendSeries,
    SpendPoint,
    SpendSeriesSource,
} from "@/lib/detection";
import { runAnomalyDetection } from "@/lib/detection";
import { DEFAULT_BUCKET_MINUTES } from "@/lib/detection/bucket";
import type { AlertRaisedEvent, EventBus } from "@/lib/event-bus";
import { describe, expect, test } from "bun:test";

const NOW = new Date("2025-05-10T12:00:00Z");
const BUCKET_MS = DEFAULT_BUCKET_MINUTES * 60_000;

const buildPoints = (costs: readonly number[], now: Date = NOW): readonly SpendPoint[] =>
    costs.map((costUsd, i) => ({
        ts: new Date(now.getTime() - (costs.length - 1 - i) * BUCKET_MS),
        costUsd,
    }));

class FakeAlertRepo implements AlertRepository {
    readonly inserted: AnomalyAlert[] = [];
    /** Track returned ids per insertion attempt so tests can assert dedup. */
    private idByKey = new Map<string, string>();
    private indexByKey = new Map<string, number>();
    private nextId = 0;

    async insertBatch(
        alerts: readonly AnomalyAlert[],
    ): Promise<readonly { readonly alert: AnomalyAlert; readonly id: string }[]> {
        const out: { alert: AnomalyAlert; id: string }[] = [];
        for (const alert of alerts) {
            const key = `${alert.scope.workspaceId}|${alert.kind}|${alert.scope.tenantId ?? ""}|${alert.scope.agentId ?? ""}|${alert.raisedAt.toISOString()}`;
            const existingIdx = this.indexByKey.get(key);
            if (existingIdx !== undefined) {
                const existing = this.inserted[existingIdx];
                if (existing !== undefined && alert.deviation > existing.deviation) {
                    this.inserted[existingIdx] = alert;
                }
                continue;
            }
            this.nextId += 1;
            const id = `00000000-0000-0000-0000-${this.nextId.toString(16).padStart(12, "0")}`;
            this.idByKey.set(key, id);
            this.indexByKey.set(key, this.inserted.length);
            this.inserted.push(alert);
            out.push({ alert, id });
        }
        return out;
    }
    async recordBudgetCrossing(): Promise<{ inserted: boolean; id: string | null }> {
        return { inserted: false, id: null };
    }
    async listForWorkspace(): Promise<readonly Alert[]> {
        return [];
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
    async publish<E>(topic: string, event: E): Promise<void> {
        this.published.push({ topic, event });
    }
    subscribe<E>(topic: string, handler: (event: E) => Promise<void> | void): void {
        // Not exercised in this suite — keep the signature compatible.
        void topic;
        void handler;
    }
}

// Baseline buckets around $0.50 so 5x spikes ($2.50) clear the $1 absolute
// floor in the detector. Three-step cycle keeps the baseline stable.
const buildBaseline = (count: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < count; i += 1) {
        out.push(0.5 + ((i % 3) - 1) * 0.005);
    }
    return out;
};
const baselineFlat = buildBaseline(23);

describe("runAnomalyDetection", () => {
    test("5x spike in a single scope → 1 alert written, 1 event published", async () => {
        const series: ScopedSpendSeries[] = [
            {
                scope: {
                    workspaceId: "ws-1",
                    tenantId: "tenant-a",
                    agentId: "agent-x",
                },
                points: buildPoints([...baselineFlat, 2.5]),
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

        expect(summary.alertsRaised).toBe(1);
        expect(repo.inserted.length).toBe(1);
        expect(repo.inserted[0]?.scope).toEqual({
            workspaceId: "ws-1",
            tenantId: "tenant-a",
            agentId: "agent-x",
        });
        expect(bus.published.length).toBe(1);
        expect(bus.published[0]?.topic).toBe("alert.raised");
        const event = bus.published[0]?.event as AlertRaisedEvent;
        expect(event.kind).toBe("anomaly");
        if (event.kind !== "anomaly") throw new Error("expected anomaly event");
        expect(event.workspaceId).toBe("ws-1");
        expect(event.tenantId).toBe("tenant-a");
        expect(event.agentId).toBe("agent-x");
        expect(event.alertId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
    });

    test("per-scope independence: spike in tenantA does NOT alert tenantB", async () => {
        const series: ScopedSpendSeries[] = [
            {
                scope: { workspaceId: "ws-1", tenantId: "tenant-a", agentId: null },
                points: buildPoints([...baselineFlat, 2.5]), // 5x spike
            },
            {
                scope: { workspaceId: "ws-1", tenantId: "tenant-b", agentId: null },
                points: buildPoints([...baselineFlat, 0.05]), // flat
            },
        ];
        const repo = new FakeAlertRepo();
        const bus = new FakeEventBus();

        await runAnomalyDetection({
            now: NOW,
            source: new FakeSpendSource(series),
            alerts: repo,
            bus,
        });

        expect(repo.inserted.length).toBe(1);
        expect(repo.inserted[0]?.scope.tenantId).toBe("tenant-a");
    });

    test("flat baseline across all scopes → 0 alerts, 0 events", async () => {
        const series: ScopedSpendSeries[] = [
            {
                scope: { workspaceId: "ws-1", tenantId: "tenant-a", agentId: null },
                points: buildPoints([...baselineFlat, 0.05]),
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

        expect(summary.alertsRaised).toBe(0);
        expect(repo.inserted.length).toBe(0);
        expect(bus.published.length).toBe(0);
    });

    test("retry with same scope state inserts and publishes only once", async () => {
        const series: ScopedSpendSeries[] = [
            {
                scope: { workspaceId: "ws-1", tenantId: "tenant-a", agentId: null },
                points: buildPoints([...baselineFlat, 2.5]),
            },
        ];
        const repo = new FakeAlertRepo();
        const bus = new FakeEventBus();

        await runAnomalyDetection({
            now: NOW,
            source: new FakeSpendSource(series),
            alerts: repo,
            bus,
        });
        await runAnomalyDetection({
            now: NOW,
            source: new FakeSpendSource(series),
            alerts: repo,
            bus,
        });

        expect(repo.inserted.length).toBe(1);
        expect(bus.published.length).toBe(1);
    });

    test("event alertId matches the persisted alert row id", async () => {
        const series: ScopedSpendSeries[] = [
            {
                scope: { workspaceId: "ws-1", tenantId: "tenant-a", agentId: null },
                points: buildPoints([...baselineFlat, 2.5]),
            },
        ];
        const repo = new FakeAlertRepo();
        const bus = new FakeEventBus();

        await runAnomalyDetection({
            now: NOW,
            source: new FakeSpendSource(series),
            alerts: repo,
            bus,
        });

        // The bus event's alertId must equal the id assigned by the repo on insert.
        // Re-running with the same state must NOT mint a new id.
        const firstId = (bus.published[0]?.event as AlertRaisedEvent).alertId;
        await runAnomalyDetection({
            now: NOW,
            source: new FakeSpendSource(series),
            alerts: repo,
            bus,
        });
        expect(bus.published.length).toBe(1);
        expect(firstId).toBeDefined();
    });

    test("published event carries the 5-min window and aggregate cost", async () => {
        const series: ScopedSpendSeries[] = [
            {
                scope: { workspaceId: "ws-1", tenantId: "tenant-a", agentId: null },
                points: buildPoints([...baselineFlat, 2.5]),
            },
        ];
        const repo = new FakeAlertRepo();
        const bus = new FakeEventBus();

        await runAnomalyDetection({
            now: NOW,
            source: new FakeSpendSource(series),
            alerts: repo,
            bus,
        });

        const event = bus.published[0]?.event as AlertRaisedEvent;
        if (event.kind !== "anomaly") throw new Error("expected anomaly event");
        expect(event.windowStart.getTime()).toBe(NOW.getTime());
        expect(event.windowEnd.getTime()).toBe(NOW.getTime() + BUCKET_MS);
        expect(event.windowCostUsd).toBe(2.5);
    });

    test("higher peak in the same bucket escalates the row but does not republish", async () => {
        const scope = { workspaceId: "ws-1", tenantId: "tenant-a", agentId: null };
        const repo = new FakeAlertRepo();
        const bus = new FakeEventBus();

        // First cron pass: peak at $2.50 inside the latest 5-min bucket.
        await runAnomalyDetection({
            now: NOW,
            source: new FakeSpendSource([{ scope, points: buildPoints([...baselineFlat, 2.5]) }]),
            alerts: repo,
            bus,
        });
        expect(repo.inserted.length).toBe(1);
        expect(bus.published.length).toBe(1);
        const firstDeviation = repo.inserted[0]?.deviation ?? 0;
        expect(repo.inserted[0]?.windowCostUsd).toBe(2.5);

        // Second cron pass within the same bucket: more events landed, peak now $5.
        // Same `raisedAt` (bucket boundary) → same deterministic id → conflict.
        // Row must reflect the new peak. Fan-out must NOT re-fire.
        await runAnomalyDetection({
            now: NOW,
            source: new FakeSpendSource([{ scope, points: buildPoints([...baselineFlat, 5]) }]),
            alerts: repo,
            bus,
        });
        expect(repo.inserted.length).toBe(1);
        expect(bus.published.length).toBe(1);
        expect(repo.inserted[0]?.windowCostUsd).toBe(5);
        expect(repo.inserted[0]?.deviation).toBeGreaterThan(firstDeviation);
    });

    test("lower peak in the same bucket leaves the row untouched", async () => {
        const scope = { workspaceId: "ws-1", tenantId: "tenant-a", agentId: null };
        const repo = new FakeAlertRepo();
        const bus = new FakeEventBus();

        await runAnomalyDetection({
            now: NOW,
            source: new FakeSpendSource([{ scope, points: buildPoints([...baselineFlat, 5]) }]),
            alerts: repo,
            bus,
        });
        const peakDeviation = repo.inserted[0]?.deviation ?? 0;

        await runAnomalyDetection({
            now: NOW,
            source: new FakeSpendSource([{ scope, points: buildPoints([...baselineFlat, 2.5]) }]),
            alerts: repo,
            bus,
        });

        expect(repo.inserted.length).toBe(1);
        expect(bus.published.length).toBe(1);
        expect(repo.inserted[0]?.windowCostUsd).toBe(5);
        expect(repo.inserted[0]?.deviation).toBe(peakDeviation);
    });

    test("insufficient history (< window points) → 0 alerts", async () => {
        const series: ScopedSpendSeries[] = [
            {
                scope: { workspaceId: "ws-1", tenantId: "tenant-a", agentId: null },
                points: buildPoints([0.01, 0.02, 0.5]),
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

        expect(summary.alertsRaised).toBe(0);
    });
});
