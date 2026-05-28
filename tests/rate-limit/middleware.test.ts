import { InMemoryRateLimiter } from "@/lib/rate-limit/in-memory.adapter";
import { applyRateLimit } from "@/lib/rate-limit/middleware";
import { setRateLimitDepsForTesting } from "@/lib/rate-limit/server";
import type { RateLimitDecision, RateLimiter } from "@/lib/rate-limit/types";
import { afterEach, describe, expect, test } from "bun:test";

const API_KEY_ID = "00000000-1111-2222-3333-444444444444";

const baseDeps = (overrides?: {
    limit?: number;
    burstLimit?: number;
    now?: () => Date;
    isCloud?: boolean;
}) => {
    const limiter = new InMemoryRateLimiter();
    return {
        limiter,
        enabled: true,
        isCloud: overrides?.isCloud ?? false,
        config: { limit: overrides?.limit ?? 3, windowMs: 1_000 },
        burstConfig: { limit: overrides?.burstLimit ?? 100, windowMs: 10_000 },
        now: overrides?.now ?? (() => new Date("2025-01-01T00:00:00.000Z")),
    };
};

class ThrowingRateLimiter implements RateLimiter {
    async check(): Promise<RateLimitDecision> {
        throw new Error("redis_unavailable");
    }
    async count(): Promise<number> {
        throw new Error("redis_unavailable");
    }
}

describe("applyRateLimit", () => {
    afterEach(() => setRateLimitDepsForTesting(null));

    test("passes through when disabled", async () => {
        setRateLimitDepsForTesting({ ...baseDeps(), enabled: false });
        const result = await applyRateLimit(API_KEY_ID);
        expect(result.response).toBeNull();
    });

    test("allows under the ceiling", async () => {
        setRateLimitDepsForTesting(baseDeps({ limit: 5 }));
        const r = await applyRateLimit(API_KEY_ID);
        expect(r.response).toBeNull();
    });

    test("returns 429 with rate cap header when the sustained ceiling fires", async () => {
        let t = 1_000;
        setRateLimitDepsForTesting(baseDeps({ limit: 2, now: () => new Date(t) }));

        await applyRateLimit(API_KEY_ID);
        t = 1_010;
        await applyRateLimit(API_KEY_ID);
        t = 1_020;
        const blocked = await applyRateLimit(API_KEY_ID);

        expect(blocked.response).not.toBeNull();
        expect(blocked.response?.status).toBe(429);
        expect(blocked.response?.headers.get("X-Bursora-Cap-Hit")).toBe("rate");
        const body = await blocked.response?.json();
        expect(body.error).toBe("rate_limit_exceeded");
        expect(body.retry_after_ms).toBeGreaterThan(0);
    });

    test("burst ceiling fires when sustained is fine", async () => {
        let t = 1_000;
        setRateLimitDepsForTesting({
            ...baseDeps({ limit: 100, burstLimit: 2 }),
            now: () => new Date(t),
        });

        await applyRateLimit(API_KEY_ID);
        t = 1_010;
        await applyRateLimit(API_KEY_ID);
        t = 1_020;
        const blocked = await applyRateLimit(API_KEY_ID);

        expect(blocked.response?.status).toBe(429);
        expect(blocked.response?.headers.get("X-Bursora-Cap-Hit")).toBe("rate");
    });

    test("recovers after window decay", async () => {
        let t = 1_000;
        setRateLimitDepsForTesting(baseDeps({ limit: 1, now: () => new Date(t) }));
        await applyRateLimit(API_KEY_ID);
        t = 1_500;
        const denied = await applyRateLimit(API_KEY_ID);
        expect(denied.response?.status).toBe(429);

        t = 2_100; // past 1s window
        const allowed = await applyRateLimit(API_KEY_ID);
        expect(allowed.response).toBeNull();
    });

    test("cloud: Redis error returns 503 with Retry-After (fail-closed)", async () => {
        setRateLimitDepsForTesting({
            ...baseDeps({ isCloud: true }),
            limiter: new ThrowingRateLimiter(),
        });
        const result = await applyRateLimit(API_KEY_ID);
        expect(result.response).not.toBeNull();
        expect(result.response?.status).toBe(503);
        expect(result.response?.headers.get("Retry-After")).toBe("5");
        const body = await result.response?.json();
        expect(body.error).toBe("rate_limit_unavailable");
    });

    test("self-host: Redis error returns null (fail-open)", async () => {
        setRateLimitDepsForTesting({
            ...baseDeps({ isCloud: false }),
            limiter: new ThrowingRateLimiter(),
        });
        const result = await applyRateLimit(API_KEY_ID);
        expect(result.response).toBeNull();
    });
});
