/**
 * Storage port for the Redis spend counter.
 *
 * The counter keeps one running USD total per (workspace, scope, period,
 * window) in Redis so the budget check reads it without touching ClickHouse on
 * every preflight. This port isolates the three Redis primitives the counter
 * needs so the domain logic (scope/period fan-out, reconcile-on-miss) is tested
 * against an in-memory fake, mirroring the `SpikeStateStore` split.
 *
 * Increment is deliberately "add only if the key already exists". A counter is
 * born from a ClickHouse reconcile (`seed`), never from a bare increment, so a
 * key can never hold a partial total after a cache loss: a dropped increment
 * just means the next read reconciles the event back in from ClickHouse, which
 * is the canonical source. Erring toward a brief under-cache (healed on read)
 * over a wrong-but-present value keeps enforcement honest.
 */

import "server-only";

export interface SpendIncrement {
    /** Counter key, built by the counter from workspace/scope/period/window. */
    readonly key: string;
    /** USD amount to add, as a decimal string (the event's `cost_usd`). */
    readonly delta: string;
    /** Key TTL in ms; refreshed on every applied increment. */
    readonly ttlMs: number;
}

export interface SpendCounterStore {
    /**
     * For each op, add `delta` to `key` ONLY when the key already exists,
     * refreshing its TTL. Ops whose key is absent are skipped — counters start
     * from a `seed`, not from an increment (see file header).
     */
    increment(ops: readonly SpendIncrement[]): Promise<void>;

    /** Current counter value as a decimal string, or `null` when absent. */
    get(key: string): Promise<string | null>;

    /**
     * Set `key` to an exact value with a TTL. Reconcile-on-miss uses this to
     * publish the ClickHouse window sum as the counter's starting total.
     */
    seed(key: string, value: string, ttlMs: number): Promise<void>;
}
