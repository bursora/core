/**
 * Tests for the tiny in-process LRU cache.
 *
 * Backed by Map insertion order: get-hits and re-sets move keys to the
 * most-recently-used end; once the cache exceeds `max`, the oldest entry
 * is evicted. Values carry a fetch timestamp for callers building a TTL.
 */

import { LruCache } from "@/lib/lru-cache";
import { describe, expect, test } from "bun:test";

describe("LruCache", () => {
    test("set/get round-trips value with its storedAtMs", () => {
        const cache = new LruCache<string, number>(2);
        cache.set("a", 1, 1000);
        expect(cache.get("a")).toEqual({ value: 1, storedAtMs: 1000 });
    });

    test("get miss returns undefined", () => {
        const cache = new LruCache<string, number>(2);
        expect(cache.get("missing")).toBeUndefined();
    });

    test("exceeding max evicts the oldest entry", () => {
        const cache = new LruCache<string, number>(2);
        cache.set("a", 1, 1000);
        cache.set("b", 2, 2000);
        cache.set("c", 3, 3000);
        expect(cache.get("a")).toBeUndefined();
        expect(cache.get("b")).toEqual({ value: 2, storedAtMs: 2000 });
        expect(cache.get("c")).toEqual({ value: 3, storedAtMs: 3000 });
        expect(cache.size()).toBe(2);
    });

    test("get hit re-inserts the key as most-recently-used", () => {
        const cache = new LruCache<string, number>(2);
        cache.set("a", 1, 1000);
        cache.set("b", 2, 2000);
        // Touch "a" so "b" becomes the least-recently-used.
        cache.get("a");
        cache.set("c", 3, 3000);
        expect(cache.get("b")).toBeUndefined();
        expect(cache.get("a")).toEqual({ value: 1, storedAtMs: 1000 });
        expect(cache.get("c")).toEqual({ value: 3, storedAtMs: 3000 });
    });

    test("re-set of existing key updates value/timestamp without growing size", () => {
        const cache = new LruCache<string, number>(2);
        cache.set("a", 1, 1000);
        cache.set("a", 9, 9000);
        expect(cache.get("a")).toEqual({ value: 9, storedAtMs: 9000 });
        expect(cache.size()).toBe(1);
    });

    test("re-set refreshes recency, sparing the key from eviction", () => {
        const cache = new LruCache<string, number>(2);
        cache.set("a", 1, 1000);
        cache.set("b", 2, 2000);
        // Re-set "a" so "b" is now the oldest.
        cache.set("a", 1, 1500);
        cache.set("c", 3, 3000);
        expect(cache.get("b")).toBeUndefined();
        expect(cache.get("a")).toEqual({ value: 1, storedAtMs: 1500 });
    });

    test("delete removes a single entry", () => {
        const cache = new LruCache<string, number>(2);
        cache.set("a", 1, 1000);
        cache.set("b", 2, 2000);
        cache.delete("a");
        expect(cache.get("a")).toBeUndefined();
        expect(cache.get("b")).toEqual({ value: 2, storedAtMs: 2000 });
        expect(cache.size()).toBe(1);
    });

    test("clear empties the cache", () => {
        const cache = new LruCache<string, number>(2);
        cache.set("a", 1, 1000);
        cache.set("b", 2, 2000);
        cache.clear();
        expect(cache.get("a")).toBeUndefined();
        expect(cache.get("b")).toBeUndefined();
        expect(cache.size()).toBe(0);
    });

    test("size reflects entry count as items are added", () => {
        const cache = new LruCache<string, number>(3);
        expect(cache.size()).toBe(0);
        cache.set("a", 1, 1000);
        cache.set("b", 2, 2000);
        expect(cache.size()).toBe(2);
    });
});
