import { InMemoryRateLimiter } from "@/lib/rate-limit/in-memory.adapter";
import { describe, expect, test } from "bun:test";

describe("InMemoryRateLimiter", () => {
    test("allows requests under the ceiling", async () => {
        const limiter = new InMemoryRateLimiter();
        const config = { limit: 5, windowMs: 1_000 };
        const results = [];
        for (let i = 0; i < 5; i++) {
            results.push(
                await limiter.check({
                    key: "k",
                    nowMs: 1_000 + i,
                    config,
                }),
            );
        }
        expect(results.every((r) => r.allowed)).toBe(true);
        expect(results[4]?.count).toBe(5);
    });

    test("rejects at the ceiling and returns positive retry-after", async () => {
        const limiter = new InMemoryRateLimiter();
        const config = { limit: 3, windowMs: 1_000 };
        for (let i = 0; i < 3; i++) {
            await limiter.check({ key: "k", nowMs: 1_000 + i, config });
        }
        const denied = await limiter.check({ key: "k", nowMs: 1_500, config });
        expect(denied.allowed).toBe(false);
        expect(denied.count).toBe(3);
        expect(denied.retryAfterMs).toBeGreaterThan(0);
    });

    test("sliding window decays after windowMs elapses", async () => {
        const limiter = new InMemoryRateLimiter();
        const config = { limit: 2, windowMs: 1_000 };
        await limiter.check({ key: "k", nowMs: 1_000, config });
        await limiter.check({ key: "k", nowMs: 1_500, config });
        const denied = await limiter.check({ key: "k", nowMs: 1_900, config });
        expect(denied.allowed).toBe(false);

        // After the window passes, the oldest entry should age out.
        const allowed = await limiter.check({ key: "k", nowMs: 2_100, config });
        expect(allowed.allowed).toBe(true);
    });

    test("isolates keys", async () => {
        const limiter = new InMemoryRateLimiter();
        const config = { limit: 1, windowMs: 1_000 };
        await limiter.check({ key: "a", nowMs: 1_000, config });
        const aDenied = await limiter.check({ key: "a", nowMs: 1_001, config });
        const bAllowed = await limiter.check({ key: "b", nowMs: 1_001, config });
        expect(aDenied.allowed).toBe(false);
        expect(bAllowed.allowed).toBe(true);
    });

    test("count() returns the live window count without writing", async () => {
        const limiter = new InMemoryRateLimiter();
        const config = { limit: 5, windowMs: 1_000 };
        await limiter.check({ key: "k", nowMs: 1_000, config });
        await limiter.check({ key: "k", nowMs: 1_500, config });
        const initialCount = await limiter.count({ key: "k", nowMs: 1_500, windowMs: 1_000 });
        expect(initialCount).toBe(2);

        // Reading should not insert.
        const repeatCount = await limiter.count({ key: "k", nowMs: 1_500, windowMs: 1_000 });
        expect(repeatCount).toBe(2);
    });
});
