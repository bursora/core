/**
 * Detection deep-module unit tests.
 *
 * Drives the pure `detectAnomaly` function exposed by `@/lib/detection`
 * with synthetic spend series (flat, spike, gradual rise, noisy, sparse).
 * The detector is intentionally agnostic: no DB, no clock, no scope smarts.
 */

import { detectAnomaly, type BaselineWindow, type SpendPoint } from "@/lib/detection";
import { describe, expect, test } from "bun:test";

const WINDOW: BaselineWindow = { points: 24, threshold: 3 };
const NOW = new Date("2025-05-10T12:00:00Z");

const series = (costs: readonly number[]): readonly SpendPoint[] =>
    costs.map((costUsd, i) => ({
        ts: new Date(NOW.getTime() - (costs.length - 1 - i) * 5 * 60_000),
        costUsd,
    }));

const baseline = (count: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < count; i += 1) {
        out.push(0.5 + ((i % 3) - 1) * 0.005);
    }
    return out;
};

describe("@/lib/detection detectAnomaly", () => {
    test("flat series → no alerts", () => {
        const alerts = detectAnomaly(series(baseline(24)), WINDOW);
        expect(alerts).toEqual([]);
    });

    test("5x spike on last point → one alert", () => {
        const alerts = detectAnomaly(series([...baseline(23), 2.5]), WINDOW);
        expect(alerts.length).toBe(1);
        expect(alerts[0]?.kind).toBe("anomaly");
        expect(alerts[0]?.deviation).toBeGreaterThan(WINDOW.threshold);
    });

    test("gradual rise inside one window → no alert (drift absorbed by baseline)", () => {
        const ramp: number[] = [];
        for (let i = 0; i < 24; i += 1) ramp.push(0.5 + i * 0.01);
        const alerts = detectAnomaly(series(ramp), WINDOW);
        expect(alerts).toEqual([]);
    });

    test("noisy baseline + moderate latest → no false positive", () => {
        const noisy = baseline(23).map((v, i) => v + (i % 3) * 0.02);
        const alerts = detectAnomaly(series([...noisy, 0.55]), WINDOW);
        expect(alerts).toEqual([]);
    });

    test("sparse series (fewer than window points) → no alert", () => {
        const alerts = detectAnomaly(series([1, 2, 5]), WINDOW);
        expect(alerts).toEqual([]);
    });

    test("empty series → no alert", () => {
        expect(detectAnomaly([], WINDOW)).toEqual([]);
    });

    test("severity escalates from warning to critical at multiplier >= threshold * 3", () => {
        // Baseline median ≈ $0.50. Threshold = 3. Warning at 3×–9× (here 5x).
        // Critical at >= 9× (here 20x = $10 against $0.50).
        const warning = detectAnomaly(series([...baseline(23), 2.5]), WINDOW);
        const critical = detectAnomaly(series([...baseline(23), 10]), WINDOW);
        expect(warning[0]?.severity).toBe("warning");
        expect(critical[0]?.severity).toBe("critical");
    });

    test("scope is attached to emitted alert", () => {
        const alerts = detectAnomaly(series([...baseline(23), 2.5]), WINDOW, {
            workspaceId: "ws-1",
            tenantId: "tenant-a",
            agentId: "agent-x",
        });
        expect(alerts[0]?.scope).toEqual({
            workspaceId: "ws-1",
            tenantId: "tenant-a",
            agentId: "agent-x",
        });
    });
});
