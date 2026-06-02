/**
 * Spike-protection wiring.
 *
 * Routes and dashboards call the bound helpers below. Tests inject fakes
 * via `setSpikeProtectionDepsForTesting`.
 *
 * Defaults:
 *   - `enabled` follows the global env flag; per-workspace row overrides it.
 *   - `thresholdMultiplier` defaults to 5x baseline; per-workspace row
 *     overrides it. Operators can dial down to 2x for tight workloads or
 *     up to 20x for noisy ones.
 *   - `cooldownMs` is 30 minutes. After a cooldown ends, the middleware
 *     re-evaluates baseline-vs-burst from scratch.
 */

import "server-only";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db";
import { env } from "../env";
import { redisClient } from "../redis/client";
import { calculate7DayWeightedBaseline } from "./baseline-calculator";
import { clickHouseBaselineSource } from "./clickhouse-baseline.source";
import { drizzleSpikeSettingsRepository } from "./drizzle-settings.repository";
import { InMemorySpikeStateStore } from "./in-memory.adapter";
import { RedisSpikeStateStore } from "./redis.adapter";
import type {
    BaselineSource,
    SpikeSettings,
    SpikeSettingsRepository,
    SpikeStateStore,
} from "./types";

export interface SpikeProtectionDeps {
    readonly enabled: boolean;
    /**
     * Cloud installs fail-closed on Redis errors (return 503); self-host
     * stays fail-open. Wired from `env().IS_CLOUD`.
     */
    readonly isCloud: boolean;
    readonly state: SpikeStateStore;
    readonly baseline: BaselineSource;
    readonly settings: SpikeSettingsRepository;
    readonly defaultMultiplier: number;
    readonly cooldownMs: number;
    readonly now: () => Date;
}

const DEFAULT_MULTIPLIER = 5;
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Minimum sustained baseline (events/min) before spike protection engages. A
 * 7-day baseline below this is too small to define a "normal": at the default
 * 5x multiplier the threshold would sit under ~5 events/min, and because event
 * counts are integers a single ordinary minute would trip the cap. New and
 * idle workspaces sit below this until real volume accumulates, so they're
 * exempt rather than tripped on their first calls.
 */
export const MIN_BASELINE_EVENTS_PER_MIN = 1;

let testOverride: SpikeProtectionDeps | null = null;

export function setSpikeProtectionDepsForTesting(deps: SpikeProtectionDeps | null): void {
    testOverride = deps;
}

export function spikeProtectionDeps(): SpikeProtectionDeps {
    if (testOverride !== null) return testOverride;
    const e = env();
    const enabled = e.BURSORA_SPIKE_PROTECTION_ENABLED;
    const state: SpikeStateStore = enabled
        ? new RedisSpikeStateStore(redisClient(e.REDIS_URL))
        : new InMemorySpikeStateStore();
    return {
        enabled,
        isCloud: e.IS_CLOUD,
        state,
        baseline: clickHouseBaselineSource(clickhouseClient()),
        settings: drizzleSpikeSettingsRepository(db()),
        defaultMultiplier: DEFAULT_MULTIPLIER,
        cooldownMs: DEFAULT_COOLDOWN_MS,
        now: () => new Date(),
    };
}

export interface ResolvedSpikeSettings {
    readonly enabled: boolean;
    readonly thresholdMultiplier: number;
}

/**
 * Merges per-workspace settings with global defaults. The workspace row's
 * `enabled` flag overrides the global env flag — operators can opt out per
 * workspace even on cloud.
 */
export async function resolveSpikeSettings(workspaceId: string): Promise<ResolvedSpikeSettings> {
    const deps = spikeProtectionDeps();
    return mergeSettings(
        await deps.settings.findByWorkspaceId(workspaceId),
        deps.enabled,
        deps.defaultMultiplier,
    );
}

export function mergeSettings(
    row: SpikeSettings | null,
    globalEnabled: boolean,
    defaultMultiplier: number,
): ResolvedSpikeSettings {
    return {
        enabled: row !== null ? row.enabled : globalEnabled,
        thresholdMultiplier: row !== null ? row.thresholdMultiplier : defaultMultiplier,
    };
}

export async function saveSpikeSettings(input: {
    readonly workspaceId: string;
    readonly enabled: boolean;
    readonly thresholdMultiplier: number;
}): Promise<void> {
    const deps = spikeProtectionDeps();
    await deps.settings.upsert({
        workspaceId: input.workspaceId,
        enabled: input.enabled,
        thresholdMultiplier: input.thresholdMultiplier,
    });
}

export interface SpikeDashboardStatus {
    readonly enabled: boolean;
    readonly thresholdMultiplier: number;
    readonly baselineEventsPerMin: number;
    readonly currentEventsPerMin: number;
    readonly thresholdEventsPerMin: number;
    /** Zero when no cooldown is active. */
    readonly cooldownRemainingMs: number;
}

/**
 * Aggregated dashboard view: settings, the cached baseline, the live
 * current-minute count, and any active cooldown. The middleware writes the
 * counter; this just reads.
 */
export async function readSpikeDashboardStatus(workspaceId: string): Promise<SpikeDashboardStatus> {
    const deps = spikeProtectionDeps();
    const merged = mergeSettings(
        await deps.settings.findByWorkspaceId(workspaceId),
        deps.enabled,
        deps.defaultMultiplier,
    );
    const nowMs = deps.now().getTime();
    const bucketMs = Math.floor(nowMs / 60_000) * 60_000;
    const [series, cooldown] = await Promise.all([
        deps.baseline.fetch7DayMinuteSeries({ workspaceId, endMs: nowMs }),
        deps.state.getCooldown({ workspaceId }),
    ]);
    const baselineEventsPerMin = calculate7DayWeightedBaseline(series);
    const thresholdEventsPerMin = baselineEventsPerMin * merged.thresholdMultiplier;

    // Reading the live minute count without writing: we peek via the same
    // store but don't increment. The Redis adapter exposes `incrementMinute`
    // only; the read-only view is the current minute's value, so we issue a
    // zero-increment which `incrementMinute(n=0)` handles cleanly.
    const current = await deps.state.incrementMinute({ workspaceId, bucketMs, n: 0 });

    const cooldownRemainingMs = cooldown.untilMs > nowMs ? cooldown.untilMs - nowMs : 0;

    return {
        enabled: merged.enabled,
        thresholdMultiplier: merged.thresholdMultiplier,
        baselineEventsPerMin,
        currentEventsPerMin: current.newCount,
        thresholdEventsPerMin,
        cooldownRemainingMs,
    };
}
