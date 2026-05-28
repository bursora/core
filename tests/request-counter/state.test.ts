/**
 * Contract tests for the shared `RequestCounterState` storage primitive.
 *
 * The in-memory variant is what these tests exercise; the Redis variant
 * mirrors the same surface but defers TTL enforcement to Redis. Domain
 * modules (rate-limit, spike-protection) layer their own rules on top of
 * this primitive and own their tests separately.
 */

import { createInMemoryRequestCounterState } from "@/lib/request-counter/in-memory.state";
import { describe, expect, test } from "bun:test";

describe("InMemoryRequestCounterState", () => {
    test("incrementBucket on an unseen key returns the increment value", async () => {
        const state = createInMemoryRequestCounterState();
        const count = await state.incrementBucket("k", 3, 1_000);
        expect(count).toBe(3);
    });

    test("incrementBucket accumulates across calls on the same key", async () => {
        const state = createInMemoryRequestCounterState();
        await state.incrementBucket("k", 2, 1_000);
        const count = await state.incrementBucket("k", 5, 1_000);
        expect(count).toBe(7);
    });

    test("incrementBucket with n=0 returns the live count without mutating", async () => {
        const state = createInMemoryRequestCounterState();
        await state.incrementBucket("k", 4, 1_000);
        const peek = await state.incrementBucket("k", 0, 1_000);
        const repeat = await state.incrementBucket("k", 0, 1_000);
        expect(peek).toBe(4);
        expect(repeat).toBe(4);
    });

    test("incrementBucket isolates by key", async () => {
        const state = createInMemoryRequestCounterState();
        await state.incrementBucket("a", 1, 1_000);
        await state.incrementBucket("b", 1, 1_000);
        const a = await state.incrementBucket("a", 0, 1_000);
        const b = await state.incrementBucket("b", 0, 1_000);
        expect(a).toBe(1);
        expect(b).toBe(1);
    });

    test("getCooldown returns 0 for an unset key", async () => {
        const state = createInMemoryRequestCounterState();
        const remaining = await state.getCooldown("k");
        expect(remaining).toBe(0);
    });

    test("setCooldown stores the expiry verbatim, observable via getCooldown", async () => {
        const state = createInMemoryRequestCounterState();
        await state.setCooldown("k", 10_000);
        const value = await state.getCooldown("k");
        expect(value).toBe(10_000);
    });

    test("cooldown values are isolated by key", async () => {
        const state = createInMemoryRequestCounterState();
        await state.setCooldown("a", 100);
        await state.setCooldown("b", 200);
        expect(await state.getCooldown("a")).toBe(100);
        expect(await state.getCooldown("b")).toBe(200);
    });
});
