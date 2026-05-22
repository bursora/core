/**
 * Redis `SpikeStateStore`. Two key shapes:
 *
 *   sp:cnt:{workspaceId}:{minute}  — INCR'd by the middleware, expires after
 *                                     two minutes so the rollover is clean.
 *   sp:cd:{workspaceId}            — set to the cooldown end epoch (ms);
 *                                     EXPIRE matches the cooldown duration
 *                                     so the key clears itself.
 */

import "server-only";

import type { Redis } from "ioredis";
import type { CooldownState, SpikeBucketIncrement, SpikeStateStore } from "./types";

const COUNTER_TTL_SECONDS = 120;

export class RedisSpikeStateStore implements SpikeStateStore {
    constructor(private readonly redis: Redis) {}

    async incrementMinute(input: {
        readonly workspaceId: string;
        readonly bucketMs: number;
        readonly n: number;
    }): Promise<SpikeBucketIncrement> {
        const key = `sp:cnt:${input.workspaceId}:${input.bucketMs}`;
        const batch = this.redis.multi();
        batch.incrby(key, input.n);
        batch.expire(key, COUNTER_TTL_SECONDS);
        const commit = batch.exec.bind(batch);
        const result = await commit();
        const newCount = readNumber(result, 0);
        return {
            priorCount: Math.max(0, newCount - input.n),
            newCount,
        };
    }

    async setCooldown(input: {
        readonly workspaceId: string;
        readonly untilMs: number;
    }): Promise<void> {
        const key = `sp:cd:${input.workspaceId}`;
        const nowMs = Date.now();
        const ttlMs = Math.max(1_000, input.untilMs - nowMs);
        await this.redis.set(key, String(input.untilMs), "PX", ttlMs);
    }

    async getCooldown(input: { readonly workspaceId: string }): Promise<CooldownState> {
        const key = `sp:cd:${input.workspaceId}`;
        const raw = await this.redis.get(key);
        if (raw === null) return { untilMs: 0 };
        const n = Number(raw);
        return { untilMs: Number.isFinite(n) ? n : 0 };
    }
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
