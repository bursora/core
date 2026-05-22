/**
 * Integration-style tests for POST /api/v1/events.
 *
 * The real route handler runs against the real `withBursoraKey` / `lookupApiKey`
 * pipeline. Auth is stubbed at the Drizzle repository boundary via
 * `mock.module`, so the real use case computes the keyHash and consults the
 * fake repository. Metering deps stay on the existing composition-root
 * testOverride so we can swap the events / pricing repositories per test.
 *
 * Behaviors covered:
 *   - 202 with valid X-Bursora-Key plaintext → events persisted
 *   - 401 on unknown api key
 *   - 401 on missing X-Bursora-Key
 *   - 401 on malformed plaintext (not bsk_<workspace>_<32hex>)
 *   - 400 on malformed JSON body
 *   - 400 on empty events array
 *   - Unknown model still ingested with cost_usd = 0
 */

import type { ApiKey } from "@/lib/identity";
import { setMeteringDepsForTesting } from "@/lib/metering/server";
import { setSetupErrorsDepsForTesting } from "@/lib/setup-errors/server";
import { InMemoryNotificationsRepository } from "@/tests/notifications/fakes/in-memory-notifications.repository";
import { InMemorySetupErrorRepository } from "@/tests/setup-errors/fakes/in-memory-setup-error.repository";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { InMemoryUsageEventRepository } from "./fakes/in-memory-usage-event.repository";
import { StubPricingRepository } from "./fakes/stub-pricing.repository";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const API_KEY_ID = "00000000-1111-2222-3333-444444444444";
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
});

const { POST } = await import("@/app/api/v1/events/route");

const validEventBody = (overrides: Record<string, unknown> = {}) => ({
    events: [
        {
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            promptTokens: 1000,
            completionTokens: 500,
            cacheTokens: 0,
            ts: "2025-05-10T12:00:00.000Z",
            ...overrides,
        },
    ],
});

interface Harness {
    events: InMemoryUsageEventRepository;
    pricing: StubPricingRepository;
}

const setupHarness = (opts: { knownKey?: boolean } = {}): Harness => {
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

    apiKeyRow =
        opts.knownKey === false
            ? null
            : {
                  id: API_KEY_ID,
                  workspaceId: WORKSPACE,
                  keyHash: "stubbed-hash",
                  name: "stub",
                  scopes: ["events:write"],
                  createdAt: new Date("2025-01-01T00:00:00Z"),
                  revokedAt: null,
              };

    setMeteringDepsForTesting({
        eventsRepo: events,
        pricingRepo: pricing,
    });

    setSetupErrorsDepsForTesting({
        repo: new InMemorySetupErrorRepository(),
        workspaceExists: async () => false,
        now: () => new Date(),
        notifications: new InMemoryNotificationsRepository(),
        listMemberUserIds: async () => [],
    });

    return { events, pricing };
};

const teardown = () => {
    apiKeyRow = null;
    setMeteringDepsForTesting(null);
    setSetupErrorsDepsForTesting(null);
};

const makeRequest = (body: string, headers: Record<string, string> = {}): Request =>
    new Request("http://localhost/api/v1/events", {
        method: "POST",
        headers: new Headers({
            "content-type": "application/json",
            ...headers,
        }),
        body,
    });

describe("POST /api/v1/events", () => {
    afterEach(() => teardown());

    test("202 with valid X-Bursora-Key plaintext, events persisted with derived workspace", async () => {
        const harness = setupHarness();
        const body = JSON.stringify(validEventBody());

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        expect(res.status).toBe(202);
        expect(harness.events.rows.length).toBe(1);
        expect(harness.events.rows[0]?.workspaceId).toBe(WORKSPACE);
    });

    test("401 on unknown api key", async () => {
        const harness = setupHarness({ knownKey: false });
        const body = JSON.stringify(validEventBody());

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        expect(res.status).toBe(401);
        expect(harness.events.rows.length).toBe(0);
    });

    test("401 on missing X-Bursora-Key header", async () => {
        const harness = setupHarness();
        const body = JSON.stringify(validEventBody());

        const res = await POST(makeRequest(body));

        expect(res.status).toBe(401);
        expect(harness.events.rows.length).toBe(0);
    });

    test("401 on malformed plaintext (no Postgres crash)", async () => {
        const harness = setupHarness();
        const body = JSON.stringify(validEventBody());

        const res = await POST(makeRequest(body, { "x-bursora-key": "not-a-real-key" }));

        expect(res.status).toBe(401);
        expect(harness.events.rows.length).toBe(0);
    });

    test("400 on malformed JSON body", async () => {
        const harness = setupHarness();

        const res = await POST(makeRequest("{not json", { "x-bursora-key": PLAINTEXT }));

        expect(res.status).toBe(400);
        expect(harness.events.rows.length).toBe(0);
    });

    test("400 when events array is empty", async () => {
        const harness = setupHarness();
        const body = JSON.stringify({ events: [] });

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        expect(res.status).toBe(400);
        expect(harness.events.rows.length).toBe(0);
    });

    test("unknown model → 202 with cost_usd = 0", async () => {
        const harness = setupHarness();
        const body = JSON.stringify({
            events: [
                {
                    provider: "unknown",
                    model: "mystery-9000",
                    region: "global",
                    promptTokens: 100,
                    completionTokens: 100,
                    cacheTokens: 0,
                    ts: "2025-05-10T12:00:00.000Z",
                },
            ],
        });

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        expect(res.status).toBe(202);
        expect(harness.events.rows[0]?.costUsd).toBe("0.00000000");
    });
});
