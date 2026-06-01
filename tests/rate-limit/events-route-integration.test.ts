/**
 * Confirms the rate-limit middleware fires on the events ingest route.
 * Mirrors the harness shape from tests/metering/events-route.test.ts but
 * trims the surface to one happy path + one cap-hit.
 */

import type { ApiKey } from "@/lib/identity";
import { setMeteringDepsForTesting } from "@/lib/metering/server";
import { InMemoryRateLimiter } from "@/lib/rate-limit/in-memory.adapter";
import { setRateLimitDepsForTesting } from "@/lib/rate-limit/server";
import { setSetupErrorsDepsForTesting } from "@/lib/setup-errors/server";
import { InMemorySpikeStateStore } from "@/lib/spike-protection/in-memory.adapter";
import { setSpikeProtectionDepsForTesting } from "@/lib/spike-protection/server";
import { InMemoryUsageEventRepository } from "@/tests/metering/fakes/in-memory-usage-event.repository";
import { StubPricingRepository } from "@/tests/metering/fakes/stub-pricing.repository";
import { InMemoryNotificationsRepository } from "@/tests/notifications/fakes/in-memory-notifications.repository";
import { InMemorySetupErrorRepository } from "@/tests/setup-errors/fakes/in-memory-setup-error.repository";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { installSelfHostEnv } from "../support/with-self-host-env";

installSelfHostEnv();

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const API_KEY_ID = "00000000-1111-2222-3333-444444444444";
const PLAINTEXT = `bsk_${WORKSPACE}_${"a".repeat(32)}`;

let apiKeyRow: ApiKey | null = null;

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
    // Owner is a regular user → no admin-owned rate-limit bypass, so the cap
    // still fires for this workspace.
    mock.module("@/lib/identity/drizzle-member.repository", () => ({
        DrizzleMemberRepository: class {
            async findOwnerUserRole(): Promise<string | null> {
                return "user";
            }
        },
    }));
});

const { POST } = await import("@/app/api/v1/events/route");

const validBody = () =>
    JSON.stringify({
        events: [
            {
                provider: "openai",
                model: "gpt-4o",
                region: "global",
                promptTokens: 10,
                completionTokens: 10,
                cacheTokens: 0,
                ts: "2025-05-10T12:00:00.000Z",
            },
        ],
    });

const makeRequest = (): Request =>
    new Request("http://localhost/api/v1/events", {
        method: "POST",
        headers: new Headers({
            "content-type": "application/json",
            "x-bursora-key": PLAINTEXT,
        }),
        body: validBody(),
    });

const setupHarness = (rateLimit: number) => {
    const events = new InMemoryUsageEventRepository();
    const pricing = new StubPricingRepository();
    pricing.addRow({
        id: "row-1",
        workspaceId: null,
        provider: "openai",
        model: "gpt-4o",
        region: "global",
        inputPer1mUsd: "0.0025",
        outputPer1mUsd: "0.01",
        cachePer1mUsd: null,
        effectiveFrom: new Date("2024-01-01T00:00:00Z"),
        effectiveTo: null,
    });

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
    };

    setMeteringDepsForTesting({ eventsRepo: events, pricingRepo: pricing });
    setSetupErrorsDepsForTesting({
        repo: new InMemorySetupErrorRepository(),
        now: () => new Date(),
        notifications: new InMemoryNotificationsRepository(),
        listMemberUserIds: async () => [],
    });

    let tickMs = 1_000;
    setRateLimitDepsForTesting({
        limiter: new InMemoryRateLimiter(),
        enabled: true,
        isCloud: false,
        config: { limit: rateLimit, windowMs: 1_000 },
        burstConfig: { limit: 1_000, windowMs: 10_000 },
        now: () => {
            const at = new Date(tickMs);
            tickMs += 10;
            return at;
        },
    });

    setSpikeProtectionDepsForTesting({
        enabled: false,
        isCloud: false,
        state: new InMemorySpikeStateStore(),
        baseline: {
            async fetch7DayMinuteSeries() {
                return [];
            },
        },
        settings: {
            async findByWorkspaceId() {
                return null;
            },
            async upsert() {},
        },
        defaultMultiplier: 5,
        cooldownMs: 30 * 60 * 1000,
        now: () => new Date(),
    });

    return { events };
};

const teardown = () => {
    apiKeyRow = null;
    setMeteringDepsForTesting(null);
    setSetupErrorsDepsForTesting(null);
    setRateLimitDepsForTesting(null);
    setSpikeProtectionDepsForTesting(null);
};

describe("POST /api/v1/events with rate limit", () => {
    afterEach(() => teardown());

    test("first request under cap → 202", async () => {
        setupHarness(5);
        const res = await POST(makeRequest());
        expect(res.status).toBe(202);
    });

    test("over cap → 429 with X-Bursora-Cap-Hit: rate", async () => {
        setupHarness(2);

        await POST(makeRequest());
        await POST(makeRequest());
        const blocked = await POST(makeRequest());

        expect(blocked.status).toBe(429);
        expect(blocked.headers.get("X-Bursora-Cap-Hit")).toBe("rate");
        const body = await blocked.json();
        expect(body.error).toBe("rate_limit_exceeded");
        expect(typeof body.retry_after_ms).toBe("number");
    });
});
