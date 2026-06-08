/**
 * Integration-style tests for POST /api/v1/test.
 *
 * The endpoint is a thin auth handshake the SDK calls at init: given a valid
 * X-Bursora-Key plaintext, returns the workspace id and `ok: true`.
 *
 * Auth is stubbed at the Drizzle repository boundary via `mock.module` so the
 * real `withSdkAuthz` pipeline (bearer auth + per-API-key rate limit) executes.
 * Rate-limit deps are swapped to the in-memory adapter so the test does not
 * require Redis.
 */

import { setBudgetingDepsForTesting } from "@/lib/budgeting/server";
import type { ApiKey } from "@/lib/identity";
import { InMemoryRateLimiter } from "@/lib/rate-limit/in-memory.adapter";
import { setRateLimitDepsForTesting } from "@/lib/rate-limit/server";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const API_KEY_ID = "00000000-1111-2222-3333-444444444444";
const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const PLAINTEXT = `bsk_${WORKSPACE}_${"a".repeat(32)}`;

let apiKeyRow: ApiKey | null = null;

beforeAll(() => {
    mock.module("@/lib/identity/drizzle-api-key.repository", () => ({
        DrizzleApiKeyRepository: class {
            async findByHash(_keyHash: string): Promise<ApiKey | null> {
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
                return { userId: "owner-user", role: "user" };
            }
        },
    }));
});

const { POST } = await import("@/app/api/v1/test/route");

const makeRequest = (headers: Record<string, string> = {}): Request =>
    new Request("http://localhost/api/v1/test", {
        method: "POST",
        headers: new Headers(headers),
    });

const setup = (opts: { knownKey: boolean }): void => {
    apiKeyRow = opts.knownKey
        ? {
              id: API_KEY_ID,
              workspaceId: WORKSPACE,
              keyHash: "stubbed-hash",
              seal: null,
              last6: null,
              name: "stub",
              scopes: [],
              createdAt: new Date("2025-01-01T00:00:00Z"),
              revokedAt: null,
              suspendedAt: null,
          }
        : null;
    setBudgetingDepsForTesting({
        budgets: {
            findApplicable: async () => [],
            listByWorkspace: async () => [],
            findById: async () => null,
            create: async () => {
                throw new Error("not used in this test");
            },
            update: async () => null,
            delete: async () => false,
        },
        spend: {
            getSpendForScopePeriod: async () => 0,
        },
        now: () => new Date("2025-05-10T12:00:00.000Z"),
    });
    setRateLimitDepsForTesting({
        limiter: new InMemoryRateLimiter(),
        enabled: true,
        isCloud: false,
        config: { limit: 100, windowMs: 1_000 },
        burstConfig: { limit: 1_000, windowMs: 10_000 },
        now: () => new Date("2025-05-10T12:00:00.000Z"),
    });
};

const teardown = () => {
    apiKeyRow = null;
    setBudgetingDepsForTesting(null);
    setRateLimitDepsForTesting(null);
};

describe("POST /api/v1/test", () => {
    afterEach(() => teardown());

    const validHeaders = (): Record<string, string> => ({
        "x-bursora-key": PLAINTEXT,
    });

    test("401 on missing X-Bursora-Key", async () => {
        setup({ knownKey: false });
        const res = await POST(makeRequest());
        expect(res.status).toBe(401);
    });

    test("401 on unknown api key", async () => {
        setup({ knownKey: false });
        const res = await POST(makeRequest(validHeaders()));
        expect(res.status).toBe(401);
    });

    test("401 on malformed plaintext", async () => {
        setup({ knownKey: true });
        const res = await POST(makeRequest({ "x-bursora-key": "garbage" }));
        expect(res.status).toBe(401);
    });

    test("200 with workspace_id and ok:true on valid key", async () => {
        setup({ knownKey: true });
        const res = await POST(makeRequest(validHeaders()));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.workspace_id).toBe(WORKSPACE);
        expect(body.ok).toBe(true);
    });
});
