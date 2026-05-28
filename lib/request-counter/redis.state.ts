/**
 * Redis `RequestCounterState`. Two key shapes:
 *
 *   <key>      — INCR'd by `incrementBucket`; PEXPIRE keeps it for `windowMs`
 *                so the bucket auto-clears after the window of inactivity.
 *   <key>      — under a separate caller-provided prefix, holds the cooldown
 *                expiry in epoch ms; PEXPIRE matches the cooldown duration so
 *                Redis clears the key when the cooldown lapses.
 *
 * Callers (rate-limit, spike-protection) namespace their keys so the two
 * domains never collide on the same Redis key.
 */

import "server-only";

import type { Redis } from "ioredis";
import type { RequestCounterState } from "./state";

export function createRedisRequestCounterState(redis: Redis): RequestCounterState {
    return {
        async incrementBucket(key, n, windowMs) {
            // Peek-only path: n === 0 reads the live count without touching TTL.
            if (n === 0) {
                const raw = await redis.get(key);
                if (raw === null) return 0;
                const parsed = Number(raw);
                return Number.isFinite(parsed) ? parsed : 0;
            }
            const batch = redis.multi();
            batch.incrby(key, n);
            batch.pexpire(key, windowMs);
            const result = await batch.exec();
            return readNumber(result, 0);
        },

        async getCooldown(key) {
            const raw = await redis.get(key);
            if (raw === null) return 0;
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? parsed : 0;
        },

        async setCooldown(key, expiryMs) {
            const nowMs = Date.now();
            const ttlMs = Math.max(1_000, expiryMs - nowMs);
            await redis.set(key, String(expiryMs), "PX", ttlMs);
        },
    };
}

function readNumber(
    result: ReadonlyArray<readonly [Error | null, unknown]> | null,
    index: number,
): number {
    if (result === null) return 0;
    const entry = result[index];
    if (!entry) return 0;
    const [err, value] = entry;
    if (err !== null) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}
