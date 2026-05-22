/**
 * In-memory `EventBundleCounterStore` for tests. Single-process, single-
 * instance — production uses the Redis adapter.
 */

import "server-only";

import type { EventBundleCount, EventBundleCounterStore } from "./types";

export class InMemoryEventBundleCounterStore implements EventBundleCounterStore {
    private readonly counters = new Map<string, number>();

    async incrementMonth(input: {
        readonly workspaceId: string;
        readonly month: string;
        readonly n: number;
    }): Promise<EventBundleCount> {
        const key = `${input.workspaceId}:${input.month}`;
        const prior = this.counters.get(key) ?? 0;
        const next = prior + input.n;
        this.counters.set(key, next);
        return { priorCount: prior, newCount: next };
    }

    async readMonth(input: {
        readonly workspaceId: string;
        readonly month: string;
    }): Promise<number> {
        return this.counters.get(`${input.workspaceId}:${input.month}`) ?? 0;
    }

    async seedMonth(input: {
        readonly workspaceId: string;
        readonly month: string;
        readonly value: number;
    }): Promise<void> {
        this.counters.set(`${input.workspaceId}:${input.month}`, input.value);
    }

    /** Wipe all state. Test-only. */
    reset(): void {
        this.counters.clear();
    }
}
