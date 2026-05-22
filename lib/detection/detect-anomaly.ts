/**
 * detectAnomaly — pure function over a single time series.
 *
 * Flags positive spend spikes against a rolling baseline using a multiplier test:
 *
 *     alert when latest > threshold * median(baseline)
 *           AND latest >= MIN_SPIKE_USD
 *
 * Median is robust to a small number of prior spikes already inside the
 * baseline window — contamination from the same scope doesn't suppress
 * detection of the next spike, which is the failure mode that mean+stddev
 * suffered from.
 *
 * MIN_SPIKE_USD filters out "5x your $0.001 average!" alerts that wake
 * nobody up productively. The minimum is a hard floor on absolute cost.
 *
 * Contract:
 *   - series ordered by ts ascending. The latest point is series[last].
 *   - series.length < baselineWindow.points → []. Not enough history.
 *   - latest.costUsd < MIN_SPIKE_USD → []. Below page-worthy threshold.
 *   - multiplier > threshold → one Alert (latest > median is implied
 *     since multiplier > 1 with center > 0; the floor handles center == 0).
 *   - median == 0 (silent baseline) → multiplier is infinite, so any
 *     above-floor spike alerts; severity is critical.
 *
 * Severity:
 *   - multiplier < threshold * CRITICAL_MULTIPLIER → "warning"
 *   - multiplier >= threshold * CRITICAL_MULTIPLIER → "critical"
 *
 * Caller-supplied scope attaches the alert to a workspace + tags;
 * detectAnomaly is intentionally agnostic so per-scope independence is
 * just "call it once per scope."
 */

import type { AlertSeverity } from "../severity";
import type { AlertScope, AnomalyAlert } from "./alert";
import { DEFAULT_BUCKET_MINUTES } from "./bucket";
import { median } from "./stats";

export interface SpendPoint {
    readonly ts: Date;
    readonly costUsd: number;
}

export interface BaselineWindow {
    readonly points: number;
    readonly threshold: number;
}

// Don't page anyone for sub-$1 spikes even if the ratio looks scary. A 5x
// jump from $0.01 to $0.05 isn't a fire alarm for indie devs.
const MIN_SPIKE_USD = 1;

// Severity escalates to critical at this multiple of the warning threshold.
const CRITICAL_MULTIPLIER = 3;

// `deviation` column is numeric(14, 6); largest representable value is
// 99,999,999.999999. Clamp before persisting so a silent-baseline spike
// (multiplier = Infinity) never overflows the DB column.
const MAX_STORABLE_DEVIATION = 99_999_999;

export function detectAnomaly(
    series: readonly SpendPoint[],
    window: BaselineWindow,
    scope: AlertScope = { workspaceId: "", tenantId: null, agentId: null },
): readonly AnomalyAlert[] {
    if (series.length < window.points) return [];

    const latest = series[series.length - 1];
    if (latest === undefined) return [];
    if (latest.costUsd < MIN_SPIKE_USD) return [];

    const baselineSlice = series.slice(
        Math.max(0, series.length - window.points),
        series.length - 1,
    );
    if (baselineSlice.length === 0) return [];

    const center = median(baselineSlice.map((p) => p.costUsd));
    const multiplier = center === 0 ? Number.POSITIVE_INFINITY : latest.costUsd / center;
    if (multiplier <= window.threshold) return [];

    const severity: AlertSeverity =
        multiplier >= window.threshold * CRITICAL_MULTIPLIER ? "critical" : "warning";
    const windowEnd = new Date(latest.ts.getTime() + DEFAULT_BUCKET_MINUTES * 60_000);

    return [
        {
            kind: "anomaly",
            scope,
            reason: formatReason(multiplier),
            deviation: Math.min(multiplier, MAX_STORABLE_DEVIATION),
            severity,
            raisedAt: latest.ts,
            windowStart: latest.ts,
            windowEnd,
            windowCostUsd: latest.costUsd,
        },
    ];
}

const formatReason = (multiplier: number): string => {
    if (!Number.isFinite(multiplier)) return "Spend spiked from a $0 baseline.";
    return `Spend spiked ${multiplier.toFixed(1)}x baseline.`;
};
