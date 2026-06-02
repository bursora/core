/**
 * Drives `RedisRequestDedupGuard.keepUnseen()` against a fake `Redis` that
 * honors `SET key val PX ttl NX` semantics: a key absent from the store is set
 * and reports "OK"; a key already present reports null. The fake records the
 * TTL it was handed so the test can assert the window is applied.
 */

import { dedupKey, RedisRequestDedupGuard } from "@/lib/metering/request-dedup";
import { describe, expect, test } from "bun:test";
import type { Redis } from "ioredis";

interface FakeRedis {
    redis: Redis;
    /** TTLs (ms) passed to each `SET ... PX <ttl> NX`, in command order. */
    ttls: number[];
}

/**
 * Minimal ioredis stand-in. `pipeline()` returns a chainable recorder; `.set`
 * with the `NX` flag stores the key once and yields "OK" on first sight, null
 * thereafter — exactly what `SET NX` returns. Commands run in order, so a key
 * repeated within one pipeline sets once and reads as present after.
 */
function createFakeRedis(): FakeRedis {
    const store = new Set<string>();
    const ttls: number[] = [];

    const redis = {
        pipeline() {
            const keys: string[] = [];
            const chain = {
                set(key: string, _value: string, _px: "PX", ttl: number, _nx: "NX") {
                    keys.push(key);
                    ttls.push(ttl);
                    return chain;
                },
                async exec(): Promise<[Error | null, unknown][]> {
                    return keys.map((key) => {
                        if (store.has(key)) return [null, null];
                        store.add(key);
                        return [null, "OK"];
                    });
                },
            };
            return chain;
        },
    };

    return { redis: redis as unknown as Redis, ttls };
}

describe("RedisRequestDedupGuard", () => {
    test("first sight returns every key as unseen", async () => {
        const { redis } = createFakeRedis();
        const guard = new RedisRequestDedupGuard(redis);

        const fresh = await guard.keepUnseen(["a", "b"]);

        expect([...fresh].sort()).toEqual(["a", "b"]);
    });

    test("a replayed key within the window is no longer unseen", async () => {
        const { redis } = createFakeRedis();
        const guard = new RedisRequestDedupGuard(redis);

        await guard.keepUnseen(["a"]);
        const second = await guard.keepUnseen(["a"]);

        expect(second.size).toBe(0);
    });

    test("a key duplicated within one batch is unseen exactly once", async () => {
        const { redis } = createFakeRedis();
        const guard = new RedisRequestDedupGuard(redis);

        const fresh = await guard.keepUnseen(["dup", "dup", "other"]);

        expect([...fresh].sort()).toEqual(["dup", "other"]);
    });

    test("empty input never touches Redis", async () => {
        const { redis, ttls } = createFakeRedis();
        const guard = new RedisRequestDedupGuard(redis);

        const fresh = await guard.keepUnseen([]);

        expect(fresh.size).toBe(0);
        expect(ttls).toHaveLength(0);
    });

    test("applies the configured idempotency window as the key TTL", async () => {
        const { redis, ttls } = createFakeRedis();
        const guard = new RedisRequestDedupGuard(redis, 5_000);

        await guard.keepUnseen(["a"]);

        expect(ttls).toEqual([5_000]);
    });
});

describe("dedupKey", () => {
    test("scopes the key by workspace so the same requestId never collides", () => {
        expect(dedupKey("ws-1", "req-x")).not.toBe(dedupKey("ws-2", "req-x"));
    });
});
