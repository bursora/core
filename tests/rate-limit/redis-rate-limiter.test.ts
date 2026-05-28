/**
 * Drives `RedisRateLimiter.check()` against a fake `Redis` that replicates
 * ioredis's `defineCommand` arg handling: when a command is defined with
 * `numberOfKeys: 1`, ioredis prepends the key count to the caller's args
 * before sending EVAL. The fake then splits args into KEYS/ARGV the way Redis
 * does and runs the script's logic, throwing Redis's real
 * "command arguments must be strings or integers" error if a value handed to
 * a `redis.call` is neither.
 *
 * Regression guard for the #942 RequestCounterState refactor: the adapter
 * passed an explicit key count on top of `numberOfKeys: 1`, shifting every
 * ARGV by one so the window-ms slot held the bucket key. `tonumber` of that
 * key is nil, and PEXPIRE rejected the nil — surfacing as a 503 on the
 * ingest path.
 */

import { RedisRateLimiter } from "@/lib/rate-limit/redis.adapter";
import type { Redis } from "ioredis";
import { describe, expect, test } from "bun:test";

/**
 * Minimal stand-in for ioredis that honors the `defineCommand` contract.
 * The generated command function mirrors ioredis `Script.execute`: it
 * unshifts `numberOfKeys` onto the caller's args, then evaluates the fixed
 * window check the way Redis would. PEXPIRE's TTL must be an integer/string;
 * anything else throws the same error Redis raises.
 */
function createFakeRedis(): Redis {
    const store = new Map<string, number>();

    const fake: Record<string, unknown> = {
        defineCommand(name: string, definition: { numberOfKeys: number; lua: string }): void {
            const numberOfKeys = definition.numberOfKeys;
            fake[name] = (...callerArgs: unknown[]) => {
                // ioredis prepends the declared key count before sending EVAL.
                const evalArgs = [numberOfKeys, ...callerArgs];
                const numKeys = Number(evalArgs[0]);
                const keys = evalArgs.slice(1, 1 + numKeys);
                const argv = evalArgs.slice(1 + numKeys);

                const key = String(keys[0]);
                const window = Number(argv[0]);
                const limit = Number(argv[1]);
                const current = store.get(key) ?? 0;
                if (current >= limit) return Promise.resolve([0, current]);
                const next = current + 1;
                store.set(key, next);
                assertRedisArg(window);
                return Promise.resolve([1, next]);
            };
        },
    };

    return fake as unknown as Redis;
}

/** Redis rejects redis.call args that are not strings or integers. */
function assertRedisArg(value: number): void {
    if (!Number.isFinite(value)) {
        throw new Error(
            "ERR Lua redis lib command arguments must be strings or integers script: ...",
        );
    }
}

describe("RedisRateLimiter", () => {
    test("check() drives the Lua script without an arg-count throw", async () => {
        const limiter = new RedisRateLimiter(createFakeRedis());
        const decision = await limiter.check({
            key: "rl:key:1s",
            nowMs: 1_000,
            config: { limit: 5, windowMs: 1_000 },
        });
        expect(decision.allowed).toBe(true);
        expect(decision.count).toBe(1);
        expect(decision.limit).toBe(5);
    });

    test("check() denies once the bucket reaches the limit", async () => {
        const limiter = new RedisRateLimiter(createFakeRedis());
        const config = { limit: 2, windowMs: 1_000 };
        await limiter.check({ key: "rl:key:1s", nowMs: 1_000, config });
        await limiter.check({ key: "rl:key:1s", nowMs: 1_000, config });
        const denied = await limiter.check({ key: "rl:key:1s", nowMs: 1_000, config });
        expect(denied.allowed).toBe(false);
        expect(denied.count).toBe(2);
        expect(denied.retryAfterMs).toBeGreaterThan(0);
    });
});
