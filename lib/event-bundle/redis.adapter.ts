/**
 * Redis `EventBundleCounterStore`. One key shape:
 *
 *   evt:{workspaceId}:{YYYY-MM}  — INCRBY'd by the middleware. Expires after
 *                                   a 35-day TTL on first write so a stale
 *                                   key from a long-quiet workspace can't
 *                                   stick around forever. Reset is implicit
 *                                   via the month key changing.
 */

import "server-only";

import type { Redis } from "ioredis";
import type { EventBundleCount, EventBundleCounterStore } from "./types";

const COUNTER_TTL_SECONDS = 35 * 24 * 60 * 60;

export class RedisEventBundleCounterStore implements EventBundleCounterStore {
    constructor(private readonly redis: Redis) {}

    async incrementMonth(input: {
        readonly workspaceId: string;
        readonly month: string;
        readonly n: number;
    }): Promise<EventBundleCount> {
        const key = counterKey(input.workspaceId, input.month);
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

    async readMonth(input: {
        readonly workspaceId: string;
        readonly month: string;
    }): Promise<number> {
        const raw = await this.redis.get(counterKey(input.workspaceId, input.month));
        if (raw === null) return 0;
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
    }

    async seedMonth(input: {
        readonly workspaceId: string;
        readonly month: string;
        readonly value: number;
    }): Promise<void> {
        const key = counterKey(input.workspaceId, input.month);
        await this.redis.set(key, String(input.value), "EX", COUNTER_TTL_SECONDS);
    }
}

function counterKey(workspaceId: string, month: string): string {
    return `evt:${workspaceId}:${month}`;
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
