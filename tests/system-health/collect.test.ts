/**
 * Unit tests for the system-health probes' pure logic: the timeout race, the
 * error-reason sanitizer (must not leak host/port into the rendered page), the
 * in-process Sentry check, and the cron snapshot's not-started contract.
 */

import { getCronStatus } from "@/lib/cron/scheduler";
import {
    posthogHealth,
    probeFailureReason,
    sentryHealth,
    withTimeout,
} from "@/lib/system-health/collect";
import { afterEach, describe, expect, test } from "bun:test";

describe("withTimeout", () => {
    test("resolves the probe value when it settles before the timeout", async () => {
        await expect(withTimeout(Promise.resolve("ok"), "x", 50)).resolves.toBe("ok");
    });

    test("rejects with a labeled timeout when the probe is too slow", async () => {
        const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 200));
        await expect(withTimeout(slow, "redis", 20)).rejects.toThrow(/redis timed out after 20ms/);
    });

    test("propagates a probe rejection", async () => {
        await expect(withTimeout(Promise.reject(new Error("boom")), "x", 50)).rejects.toThrow(
            "boom",
        );
    });
});

describe("probeFailureReason", () => {
    test("maps connection refused without leaking host:port", () => {
        const reason = probeFailureReason(new Error("connect ECONNREFUSED 10.0.0.5:6379"));
        expect(reason).toBe("Unreachable (connection refused)");
        expect(reason).not.toContain("10.0.0.5");
    });

    test("maps DNS failures", () => {
        expect(probeFailureReason(new Error("getaddrinfo ENOTFOUND smtp.internal"))).toBe(
            "DNS resolution failed",
        );
    });

    test("maps auth failures", () => {
        expect(probeFailureReason(new Error("535 Invalid login: postmaster@acme"))).toBe(
            "Authentication failed",
        );
    });

    test("maps timeouts", () => {
        expect(probeFailureReason(new Error("Redis timed out after 5000ms"))).toBe("Timed out");
    });

    test("falls back to a generic reason for unknown / non-Error values", () => {
        expect(probeFailureReason(new Error("something odd"))).toBe("Unavailable");
        expect(probeFailureReason("plain string")).toBe("Unavailable");
    });
});

describe("sentryHealth", () => {
    const originalDsn = process.env.SENTRY_DSN;
    afterEach(() => {
        if (originalDsn === undefined) delete process.env.SENTRY_DSN;
        else process.env.SENTRY_DSN = originalDsn;
    });

    test("disabled when no DSN is configured", () => {
        delete process.env.SENTRY_DSN;
        expect(sentryHealth().status).toBe("disabled");
    });

    test("down when the DSN is set but the SDK never initialized", () => {
        process.env.SENTRY_DSN = "https://abc@o1.ingest.sentry.io/1";
        const health = sentryHealth();
        expect(health.status).toBe("down");
        expect(health.error).toMatch(/not initialized/i);
    });
});

describe("posthogHealth", () => {
    const originalKey = process.env.POSTHOG_KEY;
    afterEach(() => {
        if (originalKey === undefined) delete process.env.POSTHOG_KEY;
        else process.env.POSTHOG_KEY = originalKey;
    });

    test("disabled when no key is configured", async () => {
        delete process.env.POSTHOG_KEY;
        const health = await posthogHealth();
        expect(health.status).toBe("disabled");
        expect(health.key).toBe("posthog");
    });
});

describe("getCronStatus", () => {
    test("reports not-started with no jobs before the scheduler boots", async () => {
        const status = await getCronStatus();
        expect(status.started).toBe(false);
        expect(status.jobs).toEqual([]);
    });
});
