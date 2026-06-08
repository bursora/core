/**
 * Tests for `withSdkAuthz` — composes bearer auth + rate-limit so SDK
 * route handlers can run both gates with one call instead of repeating
 * the cascade in every route.
 *
 * Auth is stubbed at the Drizzle repository boundary via `mock.module`
 * (mirrors the budget-route harness). Rate-limit deps are swapped through
 * the existing testOverride hook.
 */

import type { ApiKey } from "@/lib/identity";
import { InMemoryRateLimiter } from "@/lib/rate-limit/in-memory.adapter";
import { setRateLimitDepsForTesting } from "@/lib/rate-limit/server";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const API_KEY_ID = "00000000-1111-2222-3333-444444444444";
const PLAINTEXT = `bsk_${WORKSPACE}_${"a".repeat(32)}`;

let apiKeyRow: ApiKey | null = null;
let ownerRole: string | null = "user";

beforeAll(() => {
    mock.module("@/lib/identity/drizzle-api-key.repository", () => ({
        DrizzleApiKeyRepository: class {
            async findByHash(): Promise<ApiKey | null> {
                return apiKeyRow;
            }
            async insert(): Promise<never> {
                throw new Error("not used in this test");
            }
            async listByWorkspace(): Promise<readonly ApiKey[]> {
                return [];
            }
            async rename(): Promise<boolean> {
                return false;
            }
            async revoke(): Promise<boolean> {
                return false;
            }
        },
    }));
    mock.module("@/lib/identity/drizzle-member.repository", () => ({
        DrizzleMemberRepository: class {
            async findOwner(): Promise<{ userId: string; role: string } | null> {
                return ownerRole === null ? null : { userId: "owner-user", role: ownerRole };
            }
        },
    }));
});

const { withSdkAuthz } = await import("@/lib/identity/with-sdk-authz");

const setKnownKey = (): void => {
    apiKeyRow = {
        id: API_KEY_ID,
        workspaceId: WORKSPACE,
        keyHash: "stubbed-hash",
        seal: null,
        last6: null,
        name: "stub",
        scopes: ["events:write"],
        createdAt: new Date("2025-01-01T00:00:00Z"),
        revokedAt: null,
        suspendedAt: null,
    };
};

const setRateLimit = (overrides?: { enabled?: boolean; limit?: number }): void => {
    setRateLimitDepsForTesting({
        limiter: new InMemoryRateLimiter(),
        enabled: overrides?.enabled ?? true,
        isCloud: false,
        config: { limit: overrides?.limit ?? 100, windowMs: 1_000 },
        burstConfig: { limit: 1_000, windowMs: 10_000 },
        now: () => new Date("2025-01-01T00:00:00.000Z"),
    });
};

const makeRequest = (headers: Record<string, string> = {}): Request =>
    new Request("http://localhost/api/v1/test", {
        method: "POST",
        headers: new Headers(headers),
    });

const teardown = (): void => {
    apiKeyRow = null;
    ownerRole = "user";
    setRateLimitDepsForTesting(null);
};

describe("withSdkAuthz", () => {
    afterEach(() => teardown());

    test("auth + rate-limit pass → returns apiKey and rateLimit info", async () => {
        setKnownKey();
        setRateLimit();
        const result = await withSdkAuthz(makeRequest({ "x-bursora-key": PLAINTEXT }));

        expect(result.allowed).toBe(true);
        if (!result.allowed) throw new Error("expected allowed");
        expect(result.apiKey.id).toBe(API_KEY_ID);
        expect(result.apiKey.workspaceId).toBe(WORKSPACE);
        expect(result.rateLimit).toBeDefined();
    });

    test("missing X-Bursora-Key → 401 denied", async () => {
        setRateLimit();
        const result = await withSdkAuthz(makeRequest());

        expect(result.allowed).toBe(false);
        if (result.allowed) throw new Error("expected denied");
        expect(result.response.status).toBe(401);
        const body = await result.response.json();
        expect(body.error).toBe("unauthorized");
    });

    test("onAuthFailure fires on missing key with null hashPrefix", async () => {
        setRateLimit();
        const captures: Array<{ hashPrefix: string | null }> = [];
        const result = await withSdkAuthz(makeRequest(), {
            onAuthFailure: (info) => {
                captures.push({ hashPrefix: info.hashPrefix });
            },
        });

        expect(result.allowed).toBe(false);
        expect(captures.length).toBe(1);
        expect(captures[0]?.hashPrefix).toBeNull();
    });

    test("rate-limit cap hit → 429 with X-Bursora-Cap-Hit: rate", async () => {
        setKnownKey();
        setRateLimit({ limit: 1 });
        await withSdkAuthz(makeRequest({ "x-bursora-key": PLAINTEXT }));
        const blocked = await withSdkAuthz(makeRequest({ "x-bursora-key": PLAINTEXT }));

        expect(blocked.allowed).toBe(false);
        if (blocked.allowed) throw new Error("expected denied");
        expect(blocked.response.status).toBe(429);
        expect(blocked.response.headers.get("X-Bursora-Cap-Hit")).toBe("rate");
    });

    test("admin-owned workspace bypasses the rate limit even past the cap", async () => {
        setKnownKey();
        ownerRole = "admin";
        setRateLimit({ limit: 1 });

        const first = await withSdkAuthz(makeRequest({ "x-bursora-key": PLAINTEXT }));
        const second = await withSdkAuthz(makeRequest({ "x-bursora-key": PLAINTEXT }));

        expect(first.allowed).toBe(true);
        expect(second.allowed).toBe(true);
        if (!second.allowed) throw new Error("expected allowed");
        expect(second.rateLimit.response).toBeNull();
    });

    test("non-admin-owned workspace is still rate-limited at the cap", async () => {
        setKnownKey();
        ownerRole = "user";
        setRateLimit({ limit: 1 });

        await withSdkAuthz(makeRequest({ "x-bursora-key": PLAINTEXT }));
        const blocked = await withSdkAuthz(makeRequest({ "x-bursora-key": PLAINTEXT }));

        expect(blocked.allowed).toBe(false);
        if (blocked.allowed) throw new Error("expected denied");
        expect(blocked.response.status).toBe(429);
    });
});
