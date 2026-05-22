/**
 * Tests for the detectAnomaly deep module.
 *
 * `detectAnomaly(series, baselineWindow)` is pure: no DB, no network, no
 * clock. It flags the latest bucket as an anomaly when it exceeds
 * `threshold * median(baseline)` and clears an absolute USD floor.
 *
 * Inputs:
 *   - series: Array<{ ts: Date, costUsd: number }> — recent points (e.g.
 *     5-min buckets) ordered by ts ascending.
 *   - baselineWindow: { points: number, threshold: number } — number of
 *     points in the baseline, and the multiplier above the rolling median
 *     above which the latest point is flagged.
 *
 * Output:
 *   - Alert[] — zero or one alert per call. The alert carries a reason
 *     string with the multiplier, the multiplier as `deviation`, and a
 *     severity bucket.
 *
 * Documented policy:
 *   - series.length < baselineWindow.points → no alert (not enough data).
 *   - latest below the absolute USD floor → no alert (avoids paging on
 *     cent-scale spikes).
 *   - latest at or below median → no alert (negative dips are ignored).
 *   - multiplier at or below threshold → no alert.
 */

import { detectAnomaly } from "@/lib/detection";
import { DEFAULT_BUCKET_MINUTES } from "@/lib/detection/bucket";
import { describe, expect, test } from "bun:test";

const BUCKET_MS = DEFAULT_BUCKET_MINUTES * 60_000;

const minutesAgo = (now: Date, minutes: number): Date => new Date(now.getTime() - minutes * 60_000);

const buildSeries = (
    costs: readonly number[],
    now: Date = new Date("2025-05-10T12:00:00Z"),
): readonly { ts: Date; costUsd: number }[] => {
    return costs.map((costUsd, i) => ({
        ts: minutesAgo(now, (costs.length - 1 - i) * 5),
        costUsd,
    }));
};

const repeat = (value: number, count: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < count; i += 1) out.push(value);
    return out;
};

const jitter = (mean: number, amplitude: number, count: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < count; i += 1) {
        out.push(mean + ((i % 3) - 1) * amplitude);
    }
    return out;
};

const ramp = (start: number, step: number, count: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < count; i += 1) out.push(start + i * step);
    return out;
};

const DEFAULT_WINDOW = { points: 24, threshold: 3 };

describe("detectAnomaly", () => {
    test("insufficient history (series shorter than window) → no alerts", () => {
        const series = buildSeries([1, 1, 1, 1, 1]); // 5 points, window needs 24
        const alerts = detectAnomaly(series, DEFAULT_WINDOW);
        expect(alerts).toEqual([]);
    });

    test("flat baseline (all costs equal) → no alerts", () => {
        const series = buildSeries(repeat(5, 24));
        const alerts = detectAnomaly(series, DEFAULT_WINDOW);
        expect(alerts).toEqual([]);
    });

    test("5x spike at latest point → exactly one alert with multiplier in reason", () => {
        // 23 points around $0.50 with tiny noise, 1 point at $2.50 (5x mean).
        const baseline = jitter(0.5, 0.01, 23);
        const series = buildSeries([...baseline, 2.5]);

        const alerts = detectAnomaly(series, DEFAULT_WINDOW);

        expect(alerts.length).toBe(1);
        expect(alerts[0]!.reason).toMatch(/5/); // mentions the multiplier
        expect(alerts[0]!.deviation).toBeGreaterThan(DEFAULT_WINDOW.threshold);
    });

    test("gradual ramp (slowly increasing) → no alert", () => {
        // 24 points ramping linearly from $0.50 to $1.00. Latest is just 2x
        // the rolling median — below the 3x threshold.
        const series = buildSeries(ramp(0.5, 0.02174, 24));

        const alerts = detectAnomaly(series, DEFAULT_WINDOW);

        expect(alerts).toEqual([]);
    });

    test("retry-storm pattern (sudden burst) → alert", () => {
        // 23 quiet points around 1¢ with sub-cent jitter, then a $10 burst.
        const quiet = jitter(0.01, 0.001, 23);
        const series = buildSeries([...quiet, 10]);

        const alerts = detectAnomaly(series, DEFAULT_WINDOW);

        expect(alerts.length).toBe(1);
        expect(alerts[0]!.deviation).toBeGreaterThan(DEFAULT_WINDOW.threshold);
    });

    test("sub-floor spike → no alert (cent-scale spikes don't page anyone)", () => {
        // 5x spike but latest sits below the $1 absolute floor.
        const baseline = jitter(0.05, 0.001, 23);
        const series = buildSeries([...baseline, 0.25]);

        const alerts = detectAnomaly(series, DEFAULT_WINDOW);

        expect(alerts).toEqual([]);
    });

    test("exactly window-sized series with no spike → no alerts (boundary)", () => {
        const series = buildSeries(repeat(5, 24));
        const alerts = detectAnomaly(series, DEFAULT_WINDOW);
        expect(alerts).toEqual([]);
    });

    test("empty series → no alerts", () => {
        expect(detectAnomaly([], DEFAULT_WINDOW)).toEqual([]);
    });

    test("alert raisedAt matches the timestamp of the latest point", () => {
        const now = new Date("2025-05-10T12:00:00Z");
        const baseline = jitter(0.01, 0.001, 23);
        const series = buildSeries([...baseline, 10], now);

        const alerts = detectAnomaly(series, DEFAULT_WINDOW);

        expect(alerts.length).toBe(1);
        expect(alerts[0]!.raisedAt.getTime()).toBe(now.getTime());
    });

    test("sparse baseline (mostly zero buckets) with a genuine spike still alerts", () => {
        // 20 silent buckets, 3 small-traffic buckets, then a $50 spike. The
        // median is 0, so the multiplier is infinite and the alert fires
        // with critical severity.
        const series = buildSeries([...repeat(0, 20), 2, 2, 2, 50]);

        const alerts = detectAnomaly(series, DEFAULT_WINDOW);

        expect(alerts.length).toBe(1);
        expect(alerts[0]!.severity).toBe("critical");
    });

    test("pathological million-dollar spike is clamped to fit numeric(14,6)", () => {
        // Quiet baseline + $2M spike. Multiplier = $2M / $1 = 2,000,000 — fine.
        // But a silent baseline with the same spike makes the multiplier
        // infinite; the alert's deviation must still be storable.
        const series = buildSeries([...repeat(0, 23), 2_000_000]);

        const alerts = detectAnomaly(series, DEFAULT_WINDOW);

        expect(alerts.length).toBe(1);
        expect(alerts[0]!.deviation).toBeLessThanOrEqual(99_999_999);
    });

    test("prior spike buckets inside the baseline window do not suppress the next spike", () => {
        // Realistic scenario: a scope already spiked a few times in the last
        // two hours. The median ignores up to ~50% contamination, so a fresh
        // spike with the same magnitude still fires.
        const quiet = jitter(0.2, 0.005, 20);
        const priorSpikes = [9, 8.5, 9.5]; // three earlier $9-ish spikes
        const series = buildSeries([...quiet, ...priorSpikes, 9]);

        const alerts = detectAnomaly(series, DEFAULT_WINDOW);

        expect(alerts.length).toBe(1);
        expect(alerts[0]!.deviation).toBeGreaterThan(DEFAULT_WINDOW.threshold);
    });

    test("severity is critical when multiplier is far above threshold", () => {
        const baseline = jitter(0.01, 0.001, 23);
        const series = buildSeries([...baseline, 100]); // huge spike
        const alerts = detectAnomaly(series, DEFAULT_WINDOW);
        expect(alerts.length).toBe(1);
        expect(alerts[0]!.severity).toBe("critical");
    });

    test("alert carries the 5-min bucket window and aggregate cost", () => {
        const now = new Date("2025-05-10T12:00:00Z");
        const baseline = jitter(0.01, 0.001, 23);
        const series = buildSeries([...baseline, 12.3], now);

        const alerts = detectAnomaly(series, DEFAULT_WINDOW);

        expect(alerts.length).toBe(1);
        const alert = alerts[0]!;
        expect(alert.windowStart.getTime()).toBe(now.getTime());
        expect(alert.windowEnd.getTime()).toBe(now.getTime() + BUCKET_MS);
        expect(alert.windowCostUsd).toBe(12.3);
    });
});
