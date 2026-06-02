/**
 * Redis `SpendCounterStore`.
 *
 * `increment` runs a tiny Lua script per op: `INCRBYFLOAT` the key only when it
 * already `EXISTS`, then refresh its TTL. Doing the existence check and the
 * increment in one round trip keeps the "born from a reconcile, never from a
 * bare increment" invariant atomic (see `store.ts`). Ops pipeline so a batch is
 * one network round trip.
 *
 * `get` reads the raw decimal string; `seed` publishes the reconciled window sum
 * with `SET ... PX`. Plain `SET` is safe: increments never create a key, so an
 * absent counter being reconciled has no concurrent writer except another
 * reconcile, which computes the same window sum.
 */

import "server-only";

import type { ChainableCommander, Redis } from "ioredis";
import type { SpendCounterStore, SpendIncrement } from "./store";

const INCR_SCRIPT = [
    "local key = KEYS[1]",
    "if redis.call('EXISTS', key) == 1 then",
    "  redis.call('INCRBYFLOAT', key, ARGV[1])",
    "  redis.call('PEXPIRE', key, ARGV[2])",
    "end",
    "return 1",
].join("\n");

const INCR_COMMAND = "bursoraSpendIncr";

type IncrPipeline = ChainableCommander & {
    [INCR_COMMAND]: (key: string, delta: string, ttlMs: string) => IncrPipeline;
};

export class RedisSpendCounterStore implements SpendCounterStore {
    private readonly redis: Redis;

    constructor(redis: Redis) {
        redis.defineCommand(INCR_COMMAND, { numberOfKeys: 1, lua: INCR_SCRIPT });
        this.redis = redis;
    }

    async increment(ops: readonly SpendIncrement[]): Promise<void> {
        if (ops.length === 0) return;

        const pipeline = this.redis.pipeline() as IncrPipeline;
        for (const op of ops) {
            // `defineCommand({ numberOfKeys: 1 })` injects the key count; the
            // caller passes the key followed by ARGV (delta, ttl).
            pipeline[INCR_COMMAND](op.key, op.delta, String(op.ttlMs));
        }
        const results = await pipeline.exec();
        if (results === null) {
            throw new Error("RedisSpendCounterStore: pipeline returned no results");
        }
        for (const [err] of results) {
            if (err !== null) throw err;
        }
    }

    async get(key: string): Promise<string | null> {
        return this.redis.get(key);
    }

    async seed(key: string, value: string, ttlMs: number): Promise<void> {
        await this.redis.set(key, value, "PX", ttlMs);
    }
}
