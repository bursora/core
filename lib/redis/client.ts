/**
 * Singleton `ioredis` client. Constructed lazily on first call so module
 * import never opens a connection — important for tests and for build-time
 * code that imports the same `lib/` files but never needs Redis.
 *
 * Callers must pass `REDIS_URL`. The env layer guarantees it's present when
 * rate-limit or spike-protection is enabled; modules that depend on those
 * features should fail loudly if they ever reach here with an empty URL.
 */

import "server-only";

import Redis from "ioredis";

const GLOBAL_KEY = "__bursora_redis__";

type Globals = typeof globalThis & {
    [GLOBAL_KEY]?: Redis;
};

export function redisClient(url: string): Redis {
    if (url.length === 0) {
        throw new Error(
            "redisClient: REDIS_URL is empty; enable BURSORA_RATE_LIMIT_ENABLED or BURSORA_SPIKE_PROTECTION_ENABLED to require it.",
        );
    }
    const g = globalThis as Globals;
    if (!g[GLOBAL_KEY]) {
        g[GLOBAL_KEY] = new Redis(url, {
            // Lazy connect so importing this module never speaks to Redis until
            // the first command. Plays nice with the tests that override the
            // limiter via `setRateLimitDepsForTesting`.
            lazyConnect: true,
            maxRetriesPerRequest: 3,
        });
    }
    return g[GLOBAL_KEY];
}
