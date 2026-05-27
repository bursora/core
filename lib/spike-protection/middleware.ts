/**
 * Spike-protection middleware for the events ingest path.
 *
 * Pipeline per request:
 *   1. Look up per-workspace settings; bail out early when disabled.
 *   2. Check cooldown state; if active, return 429 with the remaining wait.
 *   3. Increment the current-minute counter by `eventCount`.
 *   4. Pull (cached) baseline and compute threshold = baseline * multiplier.
 *   5. If post-increment count > threshold, start a 30-min cooldown and
 *      return 429.
 *   6. Else return null (allow).
 *
 * The baseline read is cached in-process for 15 minutes (see
 * `baseline-cache.ts`) so the hot path doesn't hammer Postgres. Zero baseline
 * (a brand-new workspace with no history) disables the check until enough
 * traffic accumulates — we don't want to deny the very first batch.
 *
 * Redis failure policy splits by deploy mode:
 *   - Cloud (`IS_CLOUD=true`): fail-closed with 503 + `Retry-After: 5`. A
 *     silent allow during a Redis outage defeats the cap; the workload that
 *     spike protection exists to stop would burn cost unchecked.
 *   - Self-host: fail-open (return null) and log a warning. Operators run
 *     their own Redis; rejecting ingest during their outage is hostile.
 */

import "server-only";

import { NextResponse } from "next/server";
import { errMessage } from "../error-message";
import { getCachedBaseline } from "./baseline-cache";
import type { SpikeProtectionDeps } from "./server";
import { mergeSettings, spikeProtectionDeps } from "./server";

const FAIL_CLOSED_RETRY_AFTER_SECONDS = 5;

export interface SpikeOutcome {
    /** 429 / 503 response to return immediately, or `null` if the request is allowed. */
    readonly response: NextResponse | null;
}

export async function applySpikeProtection(input: {
    readonly workspaceId: string;
    readonly eventCount: number;
}): Promise<SpikeOutcome> {
    const deps = spikeProtectionDeps();
    // Short-circuit when the feature is off globally — the per-workspace row
    // can only opt out further, never opt in beyond a disabled cluster. Saves
    // a Postgres + two Redis round-trips per ingest on self-host.
    if (!deps.enabled) return { response: null };

    const nowMs = deps.now().getTime();

    try {
        const [settings, cooldown, baselineEventsPerMin] = await Promise.all([
            deps.settings.findByWorkspaceId(input.workspaceId),
            deps.state.getCooldown({ workspaceId: input.workspaceId }),
            getCachedBaseline({
                workspaceId: input.workspaceId,
                nowMs,
                source: deps.baseline,
            }),
        ]);

        const merged = mergeSettings(settings, deps.enabled, deps.defaultMultiplier);
        if (!merged.enabled) return { response: null };

        if (cooldown.untilMs > nowMs) {
            return { response: capResponse(cooldown.untilMs - nowMs) };
        }

        // No baseline yet (brand-new workspace) → skip the check; let traffic
        // accumulate so future minutes have something to compare against.
        if (baselineEventsPerMin <= 0) return { response: null };

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
            return { response: capResponse(deps.cooldownMs) };
        }
        if (incremented.newCount > threshold) {
            return { response: capResponse(deps.cooldownMs) };
        }
        return { response: null };
    } catch (err) {
        console.warn("spike_protection.redis_error", {
            err: errMessage(err),
            mode: deps.isCloud ? "cloud_fail_closed" : "self_host_fail_open",
        });
        if (deps.isCloud) return { response: unavailableResponse() };
        return { response: null };
    }
}

function capResponse(retryAfterMs: number): NextResponse {
    const response = NextResponse.json(
        { error: "spike_protection_triggered", retry_after_ms: retryAfterMs },
        { status: 429 },
    );
    response.headers.set("X-Bursora-Cap-Hit", "spike");
    response.headers.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
    return response;
}

function unavailableResponse(): NextResponse {
    const response = NextResponse.json({ error: "spike_protection_unavailable" }, { status: 503 });
    response.headers.set("Retry-After", String(FAIL_CLOSED_RETRY_AFTER_SECONDS));
    return response;
}

export type { SpikeProtectionDeps };
