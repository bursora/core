/**
 * In-memory `SpikeStateStore` for tests. Single-process, single-instance —
 * production uses the Redis adapter.
 */

import "server-only";

import type { CooldownState, SpikeBucketIncrement, SpikeStateStore } from "./types";

export class InMemorySpikeStateStore implements SpikeStateStore {
    private readonly counters = new Map<string, number>();
    private readonly cooldowns = new Map<string, number>();

    async incrementMinute(input: {
        readonly workspaceId: string;
        readonly bucketMs: number;
        readonly n: number;
    }): Promise<SpikeBucketIncrement> {
        const key = `${input.workspaceId}:${input.bucketMs}`;
        const prior = this.counters.get(key) ?? 0;
        const next = prior + input.n;
        this.counters.set(key, next);
        return { priorCount: prior, newCount: next };
    }

    async setCooldown(input: {
        readonly workspaceId: string;
        readonly untilMs: number;
    }): Promise<void> {
        this.cooldowns.set(input.workspaceId, input.untilMs);
    }

    async getCooldown(input: { readonly workspaceId: string }): Promise<CooldownState> {
        return { untilMs: this.cooldowns.get(input.workspaceId) ?? 0 };
    }

    /** Wipe all state. Test-only. */
    reset(): void {
        this.counters.clear();
        this.cooldowns.clear();
    }
}
