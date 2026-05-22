/**
 * Rate-limit primitive used by the ingest path.
 *
 * Implementations track a sliding window of requests per key and answer
 * "is this request allowed?". The Redis adapter ships in production; the
 * in-memory adapter mirrors its semantics for unit tests.
 */

import "server-only";

export interface RateLimitDecision {
    readonly allowed: boolean;
    /** Current count inside the sliding window after recording (or counting) this request. */
    readonly count: number;
    /** Configured ceiling for the window. */
    readonly limit: number;
    /** Milliseconds the caller should wait before retrying. Zero when allowed. */
    readonly retryAfterMs: number;
}

export interface RateLimitConfig {
    /** Hard ceiling on requests inside the window. */
    readonly limit: number;
    /** Window size in milliseconds (sustained 100 req/sec → 1000 ms). */
    readonly windowMs: number;
}

export interface RateLimiter {
    /**
     * Record an attempt and return the decision. The implementation
     * appends the request timestamp to the window, evicts expired entries,
     * then compares the count against `limit`.
     *
     * `key` is opaque to the limiter — callers prefix with their domain
     * (`rl:{api_key_id}` for the per-API-key bucket).
     */
    check(input: {
        readonly key: string;
        readonly nowMs: number;
        readonly config: RateLimitConfig;
    }): Promise<RateLimitDecision>;

    /**
     * Read the live window count without recording. Used by the dashboard to
     * surface "this key is currently at X / 100 req/sec" without distorting
     * production traffic.
     */
    count(input: {
        readonly key: string;
        readonly nowMs: number;
        readonly windowMs: number;
    }): Promise<number>;
}
