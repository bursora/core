/**
 * Redis `SpikeStateStore`. Two key shapes:
 *
 *   sp:cnt:{workspaceId}:{minute}  — per-minute counter INCR'd via the shared
 *                                     `RequestCounterState`; expires after two
 *                                     minutes so the rollover is clean.
 *   sp:cd:{workspaceId}            — cooldown end epoch (ms); auto-clears via
 *                                     the shared state's TTL semantics.
 *
 * The Redis primitives live in `@/lib/request-counter`; the per-workspace
 * per-minute policy (key shape, prior/new count derivation) stays here.
 */

import "server-only";

import type { Redis } from "ioredis";
import { createRedisRequestCounterState } from "../request-counter/redis.state";
import type { RequestCounterState } from "../request-counter/state";
import type { CooldownState, SpikeBucketIncrement, SpikeStateStore } from "./types";

const COUNTER_TTL_MS = 120_000;

export class RedisSpikeStateStore implements SpikeStateStore {
    private readonly state: RequestCounterState;

    constructor(redis: Redis) {
        this.state = createRedisRequestCounterState(redis);
    }

    async incrementMinute(input: {
        readonly workspaceId: string;
        readonly bucketMs: number;
        readonly n: number;
    }): Promise<SpikeBucketIncrement> {
        const newCount = await this.state.incrementBucket(
            bucketKey(input.workspaceId, input.bucketMs),
            input.n,
            COUNTER_TTL_MS,
        );
        return {
            priorCount: Math.max(0, newCount - input.n),
            newCount,
        };
    }

    async setCooldown(input: {
        readonly workspaceId: string;
        readonly untilMs: number;
    }): Promise<void> {
        await this.state.setCooldown(cooldownKey(input.workspaceId), input.untilMs);
    }

    async getCooldown(input: { readonly workspaceId: string }): Promise<CooldownState> {
        return { untilMs: await this.state.getCooldown(cooldownKey(input.workspaceId)) };
    }
}

function bucketKey(workspaceId: string, bucketMs: number): string {
    return `sp:cnt:${workspaceId}:${bucketMs}`;
}

function cooldownKey(workspaceId: string): string {
    return `sp:cd:${workspaceId}`;
}
