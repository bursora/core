/**
 * Rate-limit wiring + cap-status read.
 *
 * Pages and API routes never construct the limiter directly. The middleware
 * in `./middleware.ts` calls `rateLimitDeps()`; tests swap deps via
 * `setRateLimitDepsForTesting`. The dashboard reads workspace-wide cap
 * status by listing every API key in the workspace and calling
 * `limiter.count` for each — no extra writes, no separate counters.
 */

import "server-only";

import { env } from "../env";
import { listApiKeys } from "../identity/server";
import { redisClient } from "../redis/client";
import { InMemoryRateLimiter } from "./in-memory.adapter";
import { RedisRateLimiter } from "./redis.adapter";
import type { RateLimitConfig, RateLimiter } from "./types";

export interface RateLimitDeps {
    readonly limiter: RateLimiter;
    readonly enabled: boolean;
    readonly config: RateLimitConfig;
    readonly burstConfig: RateLimitConfig;
    readonly now: () => Date;
}

// Cloud-tuned defaults. The window is 1 second so the count maps directly to
// "req/sec"; the burst window is wider so a quick spike doesn't blow the
// sustained ceiling at exactly the wrong instant.
const DEFAULT_SUSTAINED: RateLimitConfig = { limit: 100, windowMs: 1_000 };
const DEFAULT_BURST: RateLimitConfig = { limit: 1_000, windowMs: 10_000 };

let testOverride: RateLimitDeps | null = null;

export function setRateLimitDepsForTesting(deps: RateLimitDeps | null): void {
    testOverride = deps;
}

export function rateLimitDeps(): RateLimitDeps {
    if (testOverride !== null) return testOverride;
    const e = env();
    const enabled = e.BURSORA_RATE_LIMIT_ENABLED;
    const limiter: RateLimiter = enabled
        ? new RedisRateLimiter(redisClient(e.REDIS_URL))
        : new InMemoryRateLimiter();
    return {
        limiter,
        enabled,
        config: DEFAULT_SUSTAINED,
        burstConfig: DEFAULT_BURST,
        now: () => new Date(),
    };
}

export function rateLimitKey(apiKeyId: string): string {
    return `rl:${apiKeyId}:1s`;
}

export function rateLimitBurstKey(apiKeyId: string): string {
    return `rl:${apiKeyId}:10s`;
}

export interface ApiKeyCapStatus {
    readonly apiKeyId: string;
    readonly apiKeyName: string;
    readonly sustainedCount: number;
    readonly sustainedLimit: number;
    readonly burstCount: number;
    readonly burstLimit: number;
}

/**
 * Returns the live count for every active API key in the workspace so the
 * dashboard can flag a key currently brushing the ceiling. Read-only — the
 * limiter's `count` path is trim-and-card with no insert.
 */
export async function readWorkspaceCapStatus(workspaceId: string): Promise<ApiKeyCapStatus[]> {
    const deps = rateLimitDeps();
    if (!deps.enabled) return [];
    const keys = await listApiKeys(workspaceId);
    const nowMs = deps.now().getTime();
    return Promise.all(
        keys
            .filter((k) => k.revokedAt === null)
            .map(async (k): Promise<ApiKeyCapStatus> => {
                const [sustained, burst] = await Promise.all([
                    deps.limiter.count({
                        key: rateLimitKey(k.id),
                        nowMs,
                        windowMs: deps.config.windowMs,
                    }),
                    deps.limiter.count({
                        key: rateLimitBurstKey(k.id),
                        nowMs,
                        windowMs: deps.burstConfig.windowMs,
                    }),
                ]);
                return {
                    apiKeyId: k.id,
                    apiKeyName: k.name,
                    sustainedCount: sustained,
                    sustainedLimit: deps.config.limit,
                    burstCount: burst,
                    burstLimit: deps.burstConfig.limit,
                };
            }),
    );
}
