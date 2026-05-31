/**
 * Spike-protection middleware for the events ingest path.
 *
 * Pipeline per request:
 *   1. Look up per-workspace settings; bail out early when disabled.
 *   2. Check cooldown state; if active, deny with the remaining wait.
 *   3. Increment the current-minute counter by `eventCount`.
 *   4. Pull (cached) baseline and compute threshold = baseline * multiplier.
 *   5. If post-increment count > threshold, start a 30-min cooldown and
 *      deny.
 *   6. Else allow.
 *
 * The baseline read is cached in-process for 15 minutes (see
 * `baseline-cache.ts`) so the hot path doesn't hammer Postgres. A baseline
 * below `MIN_BASELINE_EVENTS_PER_MIN` disables the check until enough traffic
 * accumulates: a baseline that small can't define a meaningful spike, so a
 * new or idle workspace would otherwise get tripped on its very first calls.
 *
 * Redis failure policy splits by deploy mode:
 *   - Cloud (`IS_CLOUD=true`): fail-closed; return a deny decision with a
 *     short retry window. A silent allow during a Redis outage defeats the
 *     cap; the workload that spike protection exists to stop would burn
 *     cost unchecked.
 *   - Self-host: fail-open (allow) and log a warning. Operators run their
 *     own Redis; rejecting ingest during their outage is hostile.
 */

import "server-only";

import { errMessage } from "../error-message";
import { getCachedBaseline } from "./baseline-cache";
import type { SpikeProtectionDeps } from "./server";
import { MIN_BASELINE_EVENTS_PER_MIN, mergeSettings, spikeProtectionDeps } from "./server";
import type { SpikeDecision } from "./types";

const FAIL_CLOSED_RETRY_AFTER_MS = 5_000;

export async function applySpikeProtection(input: {
    readonly workspaceId: string;
    readonly eventCount: number;
}): Promise<SpikeDecision> {
    const deps = spikeProtectionDeps();
    // Short-circuit when the feature is off globally — the per-workspace row
    // can only opt out further, never opt in beyond a disabled cluster. Saves
    // a Postgres + two Redis round-trips per ingest on self-host.
    if (!deps.enabled) return { allowed: true };

    const nowMs = deps.now().getTime();

    // Postgres reads stay outside the redis failure boundary: a DB outage must
    // bubble (500), not get relabeled as a spike deny. Both are read every
    // request regardless of cooldown, matching the prior parallel fetch.
    const [settings, baselineEventsPerMin] = await Promise.all([
        deps.settings.findByWorkspaceId(input.workspaceId),
        getCachedBaseline({
            workspaceId: input.workspaceId,
            nowMs,
            source: deps.baseline,
        }),
    ]);

    const merged = mergeSettings(settings, deps.enabled, deps.defaultMultiplier);
    if (!merged.enabled) return { allowed: true };

    try {
        const cooldown = await deps.state.getCooldown({ workspaceId: input.workspaceId });
        if (cooldown.untilMs > nowMs) {
            return deny(cooldown.untilMs - nowMs);
        }

        // Too little sustained traffic for a meaningful baseline → skip the
        // check. Below this floor the threshold would round toward a single
        // event and trip on normal use; let volume accumulate first.
        if (baselineEventsPerMin < MIN_BASELINE_EVENTS_PER_MIN) return { allowed: true };

        const bucketMs = Math.floor(nowMs / 60_000) * 60_000;
        const incremented = await deps.state.incrementMinute({
            workspaceId: input.workspaceId,
            bucketMs,
            n: input.eventCount,
        });

        const threshold = baselineEventsPerMin * merged.thresholdMultiplier;
        if (incremented.newCount > threshold && incremented.priorCount <= threshold) {
            await deps.state.setCooldown({
                workspaceId: input.workspaceId,
                untilMs: nowMs + deps.cooldownMs,
            });
            return deny(deps.cooldownMs);
        }
        if (incremented.newCount > threshold) {
            return deny(deps.cooldownMs);
        }
        return { allowed: true };
    } catch (err) {
        console.warn("spike_protection.redis_error", {
            err: errMessage(err),
            mode: deps.isCloud ? "cloud_fail_closed" : "self_host_fail_open",
        });
        if (deps.isCloud) return deny(FAIL_CLOSED_RETRY_AFTER_MS);
        return { allowed: true };
    }
}

function deny(retryAfterMs: number): SpikeDecision {
    return { allowed: false, retryAfterMs };
}

export type { SpikeProtectionDeps };
