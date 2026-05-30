/**
 * Redis `RateLimiter` using a fixed-window counter keyed by
 * `${baseKey}:${floor(nowMs / windowMs)}`. The bucket index in the key
 * gives a fresh counter every window, with the previous bucket aging out
 * via PEXPIRE.
 *
 * The shared `RequestCounterState` provides `incrementBucket`, but a naive
 * peek-then-increment under concurrency races: two callers could both see
 * `count < limit` and both insert, overshooting the cap. To preserve
 * atomicity, this adapter ships a small Lua script that does
 * peek-conditional-increment in a single round trip.
 *
 * The fixed-window approach has a known boundary quirk — burst at the
 * boundary can hit ~2x the limit in <1s — that the previous sliding-window
 * log avoided. The trade-off is documented in the in-memory adapter; we
 * accept it for the simpler shared primitive.
 */

import "server-only";

import type { Redis } from "ioredis";
import { createRedisRequestCounterState } from "../request-counter/redis.state";
import type { RequestCounterState } from "../request-counter/state";
import type { RateLimitDecision, RateLimiter } from "./types";

const CHECK_SCRIPT = [
    "local key = KEYS[1]",
    "local window = tonumber(ARGV[1])",
    "local limit = tonumber(ARGV[2])",
    "local current = tonumber(redis.call('GET', key) or '0')",
    "if current >= limit then",
    "  return {0, current}",
    "end",
    "local next = redis.call('INCR', key)",
    "redis.call('PEXPIRE', key, window)",
    "return {1, next}",
].join("\n");

const CHECK_COMMAND = "bursoraRateLimitCheck";

type RedisWithCheckCommand = Redis & {
    [CHECK_COMMAND]: (key: string, windowMs: string, limit: string) => Promise<[number, number]>;
};

export class RedisRateLimiter implements RateLimiter {
    private readonly redis: RedisWithCheckCommand;
    private readonly state: RequestCounterState;

    constructor(redis: Redis) {
        redis.defineCommand(CHECK_COMMAND, { numberOfKeys: 1, lua: CHECK_SCRIPT });
        this.redis = redis as RedisWithCheckCommand;
        this.state = createRedisRequestCounterState(redis);
    }

    async check(input: {
        readonly key: string;
        readonly nowMs: number;
        readonly config: { readonly limit: number; readonly windowMs: number };
    }): Promise<RateLimitDecision> {
        const { key, nowMs, config } = input;
        const bucket = bucketKey(key, nowMs, config.windowMs);
        // `defineCommand({ numberOfKeys: 1 })` already injects the key count
        // before EVAL; the caller passes only the key followed by ARGV.
        const raw = await this.redis[CHECK_COMMAND](
            bucket,
            String(config.windowMs),
            String(config.limit),
        );
        const allowed = Number(raw[0]) === 1;
        const count = Number(raw[1]);
        return {
            allowed,
            count,
            limit: config.limit,
            retryAfterMs: allowed ? 0 : bucketRemainingMs(nowMs, config.windowMs),
        };
    }

    async count(input: {
        readonly key: string;
        readonly nowMs: number;
        readonly windowMs: number;
    }): Promise<number> {
        return this.state.incrementBucket(
            bucketKey(input.key, input.nowMs, input.windowMs),
            0,
            input.windowMs,
        );
    }
}

function bucketKey(key: string, nowMs: number, windowMs: number): string {
    return `${key}:${Math.floor(nowMs / windowMs)}`;
}

function bucketRemainingMs(nowMs: number, windowMs: number): number {
    return Math.max(1, windowMs - (nowMs % windowMs));
}
