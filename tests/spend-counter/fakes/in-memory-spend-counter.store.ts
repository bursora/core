/**
 * In-memory `SpendCounterStore` for unit tests.
 *
 * Mirrors the Redis adapter's contract: `increment` adds only to keys that
 * already exist (a counter is born from `seed`), `get` returns the decimal
 * string or null, `seed` sets an exact value. Addition uses big.js so the
 * running total stays decimal-exact, matching Redis `INCRBYFLOAT` to the cent.
 *
 * `ttls` exposes the last TTL (ms) applied to each key so tests can assert the
 * counter window is covered.
 */

import type { SpendCounterStore, SpendIncrement } from "@/lib/spend-counter";
import Big from "big.js";

export class InMemorySpendCounterStore implements SpendCounterStore {
    private readonly values = new Map<string, string>();
    readonly ttls = new Map<string, number>();

    async increment(ops: readonly SpendIncrement[]): Promise<void> {
        for (const op of ops) {
            const current = this.values.get(op.key);
            if (current === undefined) continue; // add only if the key exists
            this.values.set(op.key, new Big(current).plus(new Big(op.delta)).toString());
            this.ttls.set(op.key, op.ttlMs);
        }
    }

    async get(key: string): Promise<string | null> {
        return this.values.get(key) ?? null;
    }

    async seed(key: string, value: string, ttlMs: number): Promise<void> {
        this.values.set(key, value);
        this.ttls.set(key, ttlMs);
    }
}
