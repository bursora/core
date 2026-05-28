/**
 * In-memory `SpikeStateStore` for tests. Single-process, single-instance —
 * production uses the Redis adapter.
 *
 * Storage primitives live in `@/lib/request-counter` and are shared with
 * the rate-limit adapter. The per-workspace per-minute policy (bucket key
 * shape, prior/new derivation) stays here.
 */

import "server-only";

import { createInMemoryRequestCounterState } from "../request-counter/in-memory.state";
import type { RequestCounterState } from "../request-counter/state";
import type { CooldownState, SpikeBucketIncrement, SpikeStateStore } from "./types";

/**
 * Bucket TTL well past the 60-second minute window so a fresh increment
 * after a brief gap inside the same minute still sees the running total.
 * Mirrors the Redis adapter's `COUNTER_TTL_SECONDS = 120`.
 */
const BUCKET_TTL_MS = 120_000;

export class InMemorySpikeStateStore implements SpikeStateStore {
    private readonly state: RequestCounterState;

    constructor(state: RequestCounterState = createInMemoryRequestCounterState()) {
        this.state = state;
    }

    async incrementMinute(input: {
        readonly workspaceId: string;
        readonly bucketMs: number;
        readonly n: number;
    }): Promise<SpikeBucketIncrement> {
        const newCount = await this.state.incrementBucket(
            bucketKey(input.workspaceId, input.bucketMs),
            input.n,
            BUCKET_TTL_MS,
        );
        return { priorCount: Math.max(0, newCount - input.n), newCount };
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
    return `${workspaceId}:${bucketMs}`;
}

function cooldownKey(workspaceId: string): string {
    return workspaceId;
}
