/**
 * Redis `RateLimiter` using a sliding-window log over a sorted set.
 *
 * Every `check` call ships a single server-side script that atomically:
 *   1. ZREMRANGEBYSCORE to evict timestamps older than the window.
 *   2. ZCARD to read the live count.
 *   3. If count >= limit: read the oldest entry, compute retry-after,
 *      return without writing.
 *   4. Else: ZADD the new timestamp; PEXPIRE the key to the window.
 *
 * Running the whole decision inside one server-side call keeps it atomic on
 * the Redis side, so concurrent callers can't both observe `count < limit`
 * and both insert.
 *
 * The score and member are both `nowMs` — collisions only happen when two
 * requests share a millisecond; in that case ZADD silently keeps one which
 * is the right semantics (still one request inside the same instant).
 */

import "server-only";

import type { Redis } from "ioredis";
import type { RateLimitDecision, RateLimiter } from "./types";

const CHECK_SCRIPT = [
    "local key = KEYS[1]",
    "local now = tonumber(ARGV[1])",
    "local window = tonumber(ARGV[2])",
    "local limit = tonumber(ARGV[3])",
    "local cutoff = now - window",
    "redis.call('ZREMRANGEBYSCORE', key, 0, cutoff)",
    "local count = redis.call('ZCARD', key)",
    "if count >= limit then",
    "  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')",
    "  local oldestScore = now",
    "  if oldest[2] then oldestScore = tonumber(oldest[2]) end",
    "  local retry = oldestScore + window - now",
    "  if retry < 1 then retry = 1 end",
    "  return {0, count, retry}",
    "end",
    "redis.call('ZADD', key, now, tostring(now))",
    "redis.call('PEXPIRE', key, window)",
    "return {1, count + 1, 0}",
].join("\n");

const CHECK_COMMAND = "bursoraRateLimitCheck";

type RedisWithCheckCommand = Redis & {
    [CHECK_COMMAND]: (
        keyCount: number,
        key: string,
        nowMs: string,
        windowMs: string,
        limit: string,
    ) => Promise<[number, number, number]>;
};

export class RedisRateLimiter implements RateLimiter {
    private readonly redis: RedisWithCheckCommand;

    constructor(redis: Redis) {
        redis.defineCommand(CHECK_COMMAND, { numberOfKeys: 1, lua: CHECK_SCRIPT });
        this.redis = redis as RedisWithCheckCommand;
    }

    async check(input: {
        readonly key: string;
        readonly nowMs: number;
        readonly config: { readonly limit: number; readonly windowMs: number };
    }): Promise<RateLimitDecision> {
        const { key, nowMs, config } = input;

        const raw = await this.redis[CHECK_COMMAND](
            1,
            key,
            String(nowMs),
            String(config.windowMs),
            String(config.limit),
        );

        const allowed = Number(raw[0]) === 1;
        const count = Number(raw[1]);
        const retryAfterMs = Number(raw[2]);

        return {
            allowed,
            count,
            limit: config.limit,
            retryAfterMs: allowed ? 0 : Math.max(1, retryAfterMs),
        };
    }

    async count(input: {
        readonly key: string;
        readonly nowMs: number;
        readonly windowMs: number;
    }): Promise<number> {
        const cutoff = input.nowMs - input.windowMs;
        const batch = this.redis.multi();
        batch.zremrangebyscore(input.key, 0, cutoff);
        batch.zcard(input.key);
        const result = await batch.exec();
        return readNumber(result, 1);
    }
}

function readNumber(
    pipelineResult: ReadonlyArray<readonly [Error | null, unknown]> | null,
    index: number,
): number {
    if (pipelineResult === null) return 0;
    const entry = pipelineResult[index];
    if (!entry) return 0;
    const [err, value] = entry;
    if (err !== null) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}
