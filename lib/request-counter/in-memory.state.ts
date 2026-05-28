/**
 * In-memory `RequestCounterState` for tests and self-host installs that
 * never enable Redis. Single-process, single-instance — production wires
 * the Redis variant.
 *
 * The TTL passed into `incrementBucket` and the `expiryMs` passed into
 * `setCooldown` are accepted but not enforced here. Eviction is a hygiene
 * concern that Redis handles natively (`EXPIRE`); in a single test process
 * the map is recreated per test, so leaked keys are bounded. Callers that
 * care about expiry compare against their own clock when reading the
 * cooldown.
 */

import "server-only";

import type { RequestCounterState } from "./state";

export function createInMemoryRequestCounterState(): RequestCounterState {
    const buckets = new Map<string, number>();
    const cooldowns = new Map<string, number>();

    return {
        async incrementBucket(key, n, _windowMs) {
            const next = (buckets.get(key) ?? 0) + n;
            buckets.set(key, next);
            return next;
        },

        async getCooldown(key) {
            return cooldowns.get(key) ?? 0;
        },

        async setCooldown(key, expiryMs) {
            cooldowns.set(key, expiryMs);
        },
    };
}
