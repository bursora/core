/**
 * Behavioral tests for the spike-protection middleware.
 *
 * Patterns covered:
 *   - disabled workspace → always allow.
 *   - zero baseline → allow even when burst is large.
 *   - under threshold → allow.
 *   - over threshold → 429 with spike cap header, cooldown set.
 *   - inside cooldown → 429 without re-checking baseline.
 *   - after cooldown expires → re-evaluated, fresh allow.
 */

import { resetBaselineCache } from "@/lib/spike-protection/baseline-cache";
import { InMemorySpikeStateStore } from "@/lib/spike-protection/in-memory.adapter";
import { applySpikeProtection } from "@/lib/spike-protection/middleware";
import {
    setSpikeProtectionDepsForTesting,
    type SpikeProtectionDeps,
} from "@/lib/spike-protection/server";
import type {
    BaselineSource,
    CooldownState,
    SpikeBucketIncrement,
    SpikeSettings,
    SpikeStateStore,
} from "@/lib/spike-protection/types";
import { afterEach, describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const MINUTES_PER_DAY = 24 * 60;
const SEVEN_DAYS = 7 * MINUTES_PER_DAY;

const flatSeries = (perMin: number): readonly number[] =>
    new Array<number>(SEVEN_DAYS).fill(perMin);

const fakeBaseline = (perMin: number): BaselineSource => ({
    async fetch7DayMinuteSeries() {
        return flatSeries(perMin);
    },
});

const fakeSettings = (row: SpikeSettings | null) => ({
    async findByWorkspaceId() {
        return row;
    },
    async upsert() {},
});

const baseDeps = (overrides: Partial<SpikeProtectionDeps> = {}): SpikeProtectionDeps => ({
    enabled: true,
    isCloud: false,
    state: new InMemorySpikeStateStore(),
    baseline: fakeBaseline(10),
    settings: fakeSettings(null),
    defaultMultiplier: 5,
    cooldownMs: 30 * 60 * 1000,
    now: () => new Date("2025-06-01T00:00:00.000Z"),
    ...overrides,
});

class ThrowingSpikeStateStore implements SpikeStateStore {
    async incrementMinute(): Promise<SpikeBucketIncrement> {
        throw new Error("redis_unavailable");
    }
    async setCooldown(): Promise<void> {
        throw new Error("redis_unavailable");
    }
    async getCooldown(): Promise<CooldownState> {
        throw new Error("redis_unavailable");
    }
}

describe("applySpikeProtection", () => {
    afterEach(() => {
        setSpikeProtectionDepsForTesting(null);
        resetBaselineCache();
    });

    test("passes through when globally disabled and workspace row is absent", async () => {
        setSpikeProtectionDepsForTesting(baseDeps({ enabled: false }));
        const result = await applySpikeProtection({
            workspaceId: WORKSPACE,
            eventCount: 100_000,
        });
        expect(result.response).toBeNull();
    });

    test("workspace row override flips off cloud default", async () => {
        setSpikeProtectionDepsForTesting(
            baseDeps({
                settings: fakeSettings({ enabled: false, thresholdMultiplier: 5 }),
            }),
        );
        const result = await applySpikeProtection({
            workspaceId: WORKSPACE,
            eventCount: 100_000,
        });
        expect(result.response).toBeNull();
    });

    test("zero baseline → allow (new workspace, nothing to compare against)", async () => {
        setSpikeProtectionDepsForTesting(baseDeps({ baseline: fakeBaseline(0) }));
        const result = await applySpikeProtection({
            workspaceId: WORKSPACE,
            eventCount: 5_000,
        });
        expect(result.response).toBeNull();
    });

    test("under threshold → allow", async () => {
        // Baseline 10/min, multiplier 5 → threshold 50/min. 40 events should pass.
        setSpikeProtectionDepsForTesting(baseDeps());
        const result = await applySpikeProtection({
            workspaceId: WORKSPACE,
            eventCount: 40,
        });
        expect(result.response).toBeNull();
    });

    test("over threshold → 429 with spike cap header and cooldown set", async () => {
        // Baseline 10/min, multiplier 5 → threshold 50/min. 60 events trips.
        const state = new InMemorySpikeStateStore();
        setSpikeProtectionDepsForTesting(baseDeps({ state }));
        const result = await applySpikeProtection({
            workspaceId: WORKSPACE,
            eventCount: 60,
        });
        expect(result.response).not.toBeNull();
        expect(result.response?.status).toBe(429);
        expect(result.response?.headers.get("X-Bursora-Cap-Hit")).toBe("spike");

        const body = await result.response?.json();
        expect(body.error).toBe("spike_protection_triggered");
        expect(body.retry_after_ms).toBeGreaterThan(0);

        const cooldown = await state.getCooldown({ workspaceId: WORKSPACE });
        expect(cooldown.untilMs).toBeGreaterThan(0);
    });

    test("inside cooldown returns 429 with spike cap header", async () => {
        const state = new InMemorySpikeStateStore();
        const nowMs = new Date("2025-06-01T00:00:00.000Z").getTime();
        await state.setCooldown({
            workspaceId: WORKSPACE,
            untilMs: nowMs + 5 * 60 * 1000,
        });

        setSpikeProtectionDepsForTesting(baseDeps({ state }));

        const result = await applySpikeProtection({
            workspaceId: WORKSPACE,
            eventCount: 1,
        });
        expect(result.response?.status).toBe(429);
        expect(result.response?.headers.get("X-Bursora-Cap-Hit")).toBe("spike");
    });

    test("after cooldown expires, traffic is re-evaluated", async () => {
        const state = new InMemorySpikeStateStore();
        const nowMs = new Date("2025-06-01T00:00:00.000Z").getTime();
        await state.setCooldown({
            workspaceId: WORKSPACE,
            untilMs: nowMs - 1, // already expired
        });
        setSpikeProtectionDepsForTesting(baseDeps({ state }));
        const result = await applySpikeProtection({
            workspaceId: WORKSPACE,
            eventCount: 1,
        });
        expect(result.response).toBeNull();
    });

    test("workspace multiplier override affects threshold", async () => {
        // Multiplier 2x → threshold 20. 25 events should trip.
        setSpikeProtectionDepsForTesting(
            baseDeps({
                settings: fakeSettings({ enabled: true, thresholdMultiplier: 2 }),
            }),
        );
        const result = await applySpikeProtection({
            workspaceId: WORKSPACE,
            eventCount: 25,
        });
        expect(result.response?.status).toBe(429);
    });

    test("cloud: Redis error returns 503 with Retry-After (fail-closed)", async () => {
        setSpikeProtectionDepsForTesting(
            baseDeps({ isCloud: true, state: new ThrowingSpikeStateStore() }),
        );
        const result = await applySpikeProtection({
            workspaceId: WORKSPACE,
            eventCount: 1,
        });
        expect(result.response).not.toBeNull();
        expect(result.response?.status).toBe(503);
        expect(result.response?.headers.get("Retry-After")).toBe("5");
        const body = await result.response?.json();
        expect(body.error).toBe("spike_protection_unavailable");
    });

    test("self-host: Redis error returns null (fail-open)", async () => {
        setSpikeProtectionDepsForTesting(
            baseDeps({ isCloud: false, state: new ThrowingSpikeStateStore() }),
        );
        const result = await applySpikeProtection({
            workspaceId: WORKSPACE,
            eventCount: 1,
        });
        expect(result.response).toBeNull();
    });
});
