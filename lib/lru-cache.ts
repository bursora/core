/**
 * Tiny in-process LRU cache. Backed by `Map`'s insertion-order semantics:
 * every `get` that hits re-inserts the key so the most-recently-used entry
 * sits at the end; once the cache exceeds `max`, the oldest entry (the
 * iterator's first key) is dropped.
 *
 * Values are wrapped with a fetch timestamp so callers can implement a TTL
 * on top without rolling their own metadata.
 *
 * No dependencies. Safe for use inside `lib/` and `lib/ee/`. Not safe for
 * sharing state across processes — that's what Redis is for.
 */

export interface LruEntry<V> {
    readonly value: V;
    readonly storedAtMs: number;
}

export class LruCache<K, V> {
    private readonly store = new Map<K, LruEntry<V>>();

    constructor(private readonly max: number) {}

    /** Returns the entry if present and re-inserts to mark it most-recently-used. */
    get(key: K): LruEntry<V> | undefined {
        const entry = this.store.get(key);
        if (entry === undefined) return undefined;
        this.store.delete(key);
        this.store.set(key, entry);
        return entry;
    }

    set(key: K, value: V, storedAtMs: number): void {
        if (this.store.has(key)) {
            this.store.delete(key);
        } else if (this.store.size >= this.max) {
            const oldest = this.store.keys().next().value;
            if (oldest !== undefined) this.store.delete(oldest);
        }
        this.store.set(key, { value, storedAtMs });
    }

    delete(key: K): void {
        this.store.delete(key);
    }

    clear(): void {
        this.store.clear();
    }

    /** Current entry count. Test-only. */
    size(): number {
        return this.store.size;
    }
}
