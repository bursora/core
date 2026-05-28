/**
 * Shared storage primitive for request counters and cooldown timers.
 *
 * Two collaborators in the platform — the per-API-key rate limiter and the
 * per-workspace spike protector — both keep a bucket counter that grows and
 * an optional cooldown that holds further traffic off. Their policies differ
 * (per-second cap vs per-minute baseline-vs-burst, with cooldown only on the
 * spike side), but the storage primitive is the same: increment a counter
 * that expires after `windowMs`, and read/write an absolute cooldown
 * expiry. The shared primitive lives here so the in-memory and Redis
 * implementations are written and tested once.
 *
 * Implementations:
 *   - `createInMemoryRequestCounterState()` — `./in-memory.state`
 *   - `createRedisRequestCounterState(redis)` — `./redis.state`
 *
 * Domain modules wrap this primitive and add their own decision logic
 * (`is the bucket over the limit?`, `is now past the cooldown?`).
 */

import "server-only";

export interface RequestCounterState {
    /**
     * Add `n` to the bucket under `key` and return the new total. Passing
     * `n = 0` reads the live count without mutating. The Redis variant
     * resets the key's TTL to `windowMs` on every non-zero increment so the
     * bucket auto-evicts after the window of inactivity; the in-memory
     * variant accepts the TTL but does not enforce it (the map is
     * recreated per test).
     */
    incrementBucket(key: string, n: number, windowMs: number): Promise<number>;

    /**
     * Returns the stored cooldown value (epoch ms) under `key`, or `0` when
     * nothing is set. The Redis variant auto-clears the key once `expiryMs`
     * has passed via PEXPIRE; the in-memory variant keeps the raw value
     * and leaves the expiry check to the caller's clock.
     */
    getCooldown(key: string): Promise<number>;

    /**
     * Mark `key` as cooling down until `expiryMs` (absolute epoch ms). On
     * Redis the key is given a TTL matching the remaining cooldown so it
     * clears itself; in memory the value is stored verbatim.
     */
    setCooldown(key: string, expiryMs: number): Promise<void>;
}
