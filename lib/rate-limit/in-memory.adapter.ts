/**
 * In-memory `RateLimiter` for tests and self-host installs that never enable
 * Redis. Production cloud always wires the Redis adapter.
 *
 * Storage primitives live in `@/lib/request-counter` and are shared with the
 * spike-protection adapter. The per-API-key per-second policy stays here:
 * a fixed-window bucket keyed by `${baseKey}:${floor(nowMs / windowMs)}`,
 * with retry-after estimated from the time remaining in the current bucket.
 *
 * Fixed-window has a known boundary quirk: a burst that straddles two
 * adjacent buckets can hit up to `2 * limit` in under a window. The previous
 * implementation used a sliding-window log to avoid that, but the shared
 * counter is simpler, faster on Redis, and the boundary slop is small
 * relative to a 1-second window. Cloud's 100 req/sec limit can briefly see
 * ~200 req/sec at a boundary; sustained traffic stays inside the cap.
 */

import "server-only";

import { createInMemoryRequestCounterState } from "../request-counter/in-memory.state";
import type { RequestCounterState } from "../request-counter/state";
import type { RateLimitDecision, RateLimiter } from "./types";

export class InMemoryRateLimiter implements RateLimiter {
    private readonly state: RequestCounterState;

    constructor(state: RequestCounterState = createInMemoryRequestCounterState()) {
        this.state = state;
    }

    async check(input: {
        readonly key: string;
        readonly nowMs: number;
        readonly config: { readonly limit: number; readonly windowMs: number };
    }): Promise<RateLimitDecision> {
        const { key, nowMs, config } = input;
        const bucket = bucketKey(key, nowMs, config.windowMs);
        const current = await this.state.incrementBucket(bucket, 0, config.windowMs);
        if (current >= config.limit) {
            return {
                allowed: false,
                count: current,
                limit: config.limit,
                retryAfterMs: bucketRemainingMs(nowMs, config.windowMs),
            };
        }
        const next = await this.state.incrementBucket(bucket, 1, config.windowMs);
        return {
            allowed: true,
            count: next,
            limit: config.limit,
            retryAfterMs: 0,
        };
    }

    async count(input: {
        readonly key: string;
        readonly nowMs: number;
        readonly windowMs: number;
    }): Promise<number> {
        const bucket = bucketKey(input.key, input.nowMs, input.windowMs);
        return this.state.incrementBucket(bucket, 0, input.windowMs);
    }
}

function bucketKey(key: string, nowMs: number, windowMs: number): string {
    return `${key}:${Math.floor(nowMs / windowMs)}`;
}

function bucketRemainingMs(nowMs: number, windowMs: number): number {
    return Math.max(1, windowMs - (nowMs % windowMs));
}
