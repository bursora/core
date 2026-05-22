/**
 * In-memory `RateLimiter` for tests and self-host installs that never enable
 * Redis. Mirrors the Redis adapter's sliding-window semantics: every call
 * appends `nowMs` to a per-key list, evicts entries older than the window,
 * then compares the length against `limit`.
 *
 * Not safe for multi-process deployments — that's what the Redis adapter is
 * for. Production cloud always wires the Redis adapter.
 */

import "server-only";

import type { RateLimitDecision, RateLimiter } from "./types";

export class InMemoryRateLimiter implements RateLimiter {
    private readonly buckets = new Map<string, number[]>();

    async check(input: {
        readonly key: string;
        readonly nowMs: number;
        readonly config: { readonly limit: number; readonly windowMs: number };
    }): Promise<RateLimitDecision> {
        const { key, nowMs, config } = input;
        const trimmed = this.trimmed(key, nowMs, config.windowMs);

        if (trimmed.length >= config.limit) {
            this.buckets.set(key, trimmed);
            const oldest = trimmed[0] ?? nowMs;
            const retryAfterMs = Math.max(1, oldest + config.windowMs - nowMs);
            return {
                allowed: false,
                count: trimmed.length,
                limit: config.limit,
                retryAfterMs,
            };
        }

        trimmed.push(nowMs);
        this.buckets.set(key, trimmed);
        return {
            allowed: true,
            count: trimmed.length,
            limit: config.limit,
            retryAfterMs: 0,
        };
    }

    async count(input: {
        readonly key: string;
        readonly nowMs: number;
        readonly windowMs: number;
    }): Promise<number> {
        const trimmed = this.trimmed(input.key, input.nowMs, input.windowMs);
        this.buckets.set(input.key, trimmed);
        return trimmed.length;
    }

    private trimmed(key: string, nowMs: number, windowMs: number): number[] {
        const cutoff = nowMs - windowMs;
        const existing = this.buckets.get(key) ?? [];
        return existing.filter((ts) => ts > cutoff);
    }

    /** Wipe all buckets. Test-only. */
    reset(): void {
        this.buckets.clear();
    }
}
