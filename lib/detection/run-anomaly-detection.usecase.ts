/**
 * run-anomaly-detection — orchestrator for the anomaly cron.
 *
 * Drives the detection loop:
 *   1. Pull every (workspaceId, tenantId, agentId) scope's recent spend
 *      series from the source.
 *   2. Run the pure detectAnomaly module against each series with the
 *      default baseline window (24 points, spike multiplier 3x).
 *   3. Persist any alerts and publish `alert.raised` so the notification
 *      handler fans out to webhooks.
 *
 * Per-scope independence falls out of step (2): the detector is pure and
 * stateless, so each scope is evaluated in isolation.
 *
 * The lookback window is `points * bucketMinutes`. With defaults that's
 * 24 * 5 = 120 minutes (2 hours). The cron runs every 5 minutes, so the
 * latest bucket is always ≤ 5 minutes old.
 */

import type { AnomalyAlert } from "./alert";
import type { AlertRepository } from "./alert.repository";
import { DEFAULT_BUCKET_MINUTES } from "./bucket";
import { detectAnomaly } from "./detect-anomaly";
import type { SpendSeriesSource } from "./spend-series-source";
import { ALERT_RAISED_TOPIC, type AlertRaisedEvent, type EventBus } from "../event-bus";

export const DEFAULT_BASELINE_POINTS = 24;
// Alert when the latest bucket is at least this multiple of the rolling
// median. 3x catches noticeable spikes (agent loops, retry storms) without
// pinging on routine traffic variance. Severity goes critical at 3x this.
export const DEFAULT_SPIKE_MULTIPLIER = 3;
export { DEFAULT_BUCKET_MINUTES };

export interface RunAnomalyDetectionInput {
    readonly now: Date;
    readonly source: SpendSeriesSource;
    readonly alerts: AlertRepository;
    readonly bus: EventBus;
}

export interface RunAnomalyDetectionSummary {
    readonly scopesScanned: number;
    readonly alertsRaised: number;
}

export async function runAnomalyDetection(
    input: RunAnomalyDetectionInput,
): Promise<RunAnomalyDetectionSummary> {
    const lookbackMs = DEFAULT_BASELINE_POINTS * DEFAULT_BUCKET_MINUTES * 60_000;
    const since = new Date(input.now.getTime() - lookbackMs);

    const allSeries = await input.source.listScopedSeries(since);

    const flat: AnomalyAlert[] = [];
    for (const { scope, points } of allSeries) {
        flat.push(
            ...detectAnomaly(
                points,
                {
                    points: DEFAULT_BASELINE_POINTS,
                    threshold: DEFAULT_SPIKE_MULTIPLIER,
                },
                scope,
            ),
        );
    }

    // Persist with row-level idempotency. Only rows that were actually
    // inserted come back, paired with the DB row id. Publish one event per
    // inserted row using that real id so downstream fan-out can correlate
    // the bus event back to the `alerts` row.
    const inserted = await input.alerts.insertBatch(flat);
    await Promise.all(
        inserted.map(({ alert, id }) =>
            input.bus.publish<AlertRaisedEvent>(ALERT_RAISED_TOPIC, toEvent(alert, id)),
        ),
    );

    return {
        scopesScanned: allSeries.length,
        alertsRaised: inserted.length,
    };
}

const toEvent = (alert: AnomalyAlert, alertId: string): AlertRaisedEvent => ({
    kind: alert.kind,
    alertId,
    workspaceId: alert.scope.workspaceId,
    tenantId: alert.scope.tenantId,
    agentId: alert.scope.agentId,
    reason: alert.reason,
    deviation: alert.deviation,
    severity: alert.severity,
    raisedAt: alert.raisedAt,
    windowStart: alert.windowStart,
    windowEnd: alert.windowEnd,
    // `Alert.windowCostUsd` is `number | null` only for legacy read-path rows;
    // detector-built alerts (the only producer feeding this bus) always set it.
    windowCostUsd: alert.windowCostUsd as number,
});
