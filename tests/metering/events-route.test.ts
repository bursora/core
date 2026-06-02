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
 *   - 202 with `unpriced` (provider+model) listed when a model has no pricing
 *     row (issue #915); structured server log fires; priced siblings persist;
 *     a fully-unpriced batch persists nothing but still reports the gap
 */

import { InMemoryEventBundleCounterStore } from "@/lib/event-bundle/in-memory.adapter";
import { resetEventBundleColdWriteTracker } from "@/lib/event-bundle/middleware";
import { setEventBundleDepsForTesting } from "@/lib/event-bundle/server";
import type { ApiKey } from "@/lib/identity";
import { setMeteringDepsForTesting } from "@/lib/metering/server";
import { setSetupErrorsDepsForTesting } from "@/lib/setup-errors/server";
import { InMemorySpikeStateStore } from "@/lib/spike-protection/in-memory.adapter";
import { setSpikeProtectionDepsForTesting } from "@/lib/spike-protection/server";
import { InMemoryNotificationsRepository } from "@/tests/notifications/fakes/in-memory-notifications.repository";
import { InMemorySetupErrorRepository } from "@/tests/setup-errors/fakes/in-memory-setup-error.repository";
import { afterEach, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { InMemoryRequestDedupGuard } from "./fakes/in-memory-request-dedup.guard";
import { InMemoryUsageEventRepository } from "./fakes/in-memory-usage-event.repository";
import { StubPricingRepository } from "./fakes/stub-pricing.repository";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const API_KEY_ID = "00000000-1111-2222-3333-444444444444";
const PLAINTEXT = `bsk_${WORKSPACE}_${"a".repeat(32)}`;
const MONTH = "2025-05";

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
    // Owner is a regular user → no admin-owned bypass; the route runs the
    // rate limiter and records bundle usage as normal.
    mock.module("@/lib/identity/drizzle-member.repository", () => ({
        DrizzleMemberRepository: class {
            async findOwnerUserRole(): Promise<string | null> {
                return "user";
            }
        },
    }));
});

const { POST } = await import("@/app/api/v1/events/route");

const validEvent = (overrides: Record<string, unknown> = {}) => ({
    provider: "openai",
    model: "gpt-4o",
    region: "global",
    promptTokens: 1000,
    completionTokens: 500,
    cacheTokens: 0,
    ts: "2025-05-10T12:00:00.000Z",
    ...overrides,
});

const validEventBody = (overrides: Record<string, unknown> = {}) => ({
    events: [validEvent(overrides)],
});

interface Harness {
    events: InMemoryUsageEventRepository;
    pricing: StubPricingRepository;
    bundleCounter: InMemoryEventBundleCounterStore;
}

const setupHarness = (opts: { knownKey?: boolean } = {}): Harness => {
    const events = new InMemoryUsageEventRepository();
    const pricing = new StubPricingRepository();
    const bundleCounter = new InMemoryEventBundleCounterStore();

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
                  seal: null,
                  last6: null,
                  name: "stub",
                  scopes: ["events:write"],
                  createdAt: new Date("2025-01-01T00:00:00Z"),
                  revokedAt: null,
              };

    setMeteringDepsForTesting({
        eventsRepo: events,
        pricingRepo: pricing,
        dedup: new InMemoryRequestDedupGuard(),
    });

    setEventBundleDepsForTesting({
        enabled: true,
        counter: bundleCounter,
        usage: {
            async findMonth() {
                return null;
            },
            async upsertMonth() {},
        },
        now: () => new Date("2025-05-10T12:00:00.000Z"),
    });

    setSetupErrorsDepsForTesting({
        repo: new InMemorySetupErrorRepository(),
        now: () => new Date(),
        notifications: new InMemoryNotificationsRepository(),
        listMemberUserIds: async () => [],
    });

    // Spike protection is irrelevant here, but unstubbed it falls through to the
    // real Drizzle settings repo and queries the DB. Stub it disabled so these
    // tests stay hermetic (the sister rate-limit integration test does the same).
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

    return { events, pricing, bundleCounter };
};

const teardown = () => {
    apiKeyRow = null;
    setMeteringDepsForTesting(null);
    setEventBundleDepsForTesting(null);
    resetEventBundleColdWriteTracker();
    setSetupErrorsDepsForTesting(null);
    setSpikeProtectionDepsForTesting(null);
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

    test("replayed event with same requestId → 202 idempotent, only one row persists", async () => {
        const harness = setupHarness();
        const body = JSON.stringify(validEventBody({ requestId: "chatcmpl-abc123" }));

        const first = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));
        const second = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        // SAFE-not-sorry: both calls succeed (the SDK retried; that's expected)
        // but only one row lands. The customer is never billed twice for the
        // same upstream LLM call (issue #914).
        expect(first.status).toBe(202);
        expect(second.status).toBe(202);
        expect(harness.events.rows.length).toBe(1);
    });

    test("replayed requestId bumps the event-bundle counter by 1, not by the retry count", async () => {
        const harness = setupHarness();
        const body = JSON.stringify(validEventBody({ requestId: "chatcmpl-abc123" }));

        // Same upstream call retried 3x. Only the first delivery persists a row,
        // so the plan-bundle counter must advance by 1, not 3. Issue #1002:
        // counting retries would over-bill the customer toward their bundle.
        await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));
        await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));
        await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        const counted = await harness.bundleCounter.readMonth({
            workspaceId: WORKSPACE,
            month: MONTH,
        });
        expect(counted).toBe(1);
    });

    test("mixed batch [new, new, duplicate] bumps the counter by 2", async () => {
        const harness = setupHarness();
        // Seed one row by id "dup" so the duplicate in the next batch dedups.
        await POST(
            makeRequest(JSON.stringify(validEventBody({ requestId: "dup" })), {
                "x-bursora-key": PLAINTEXT,
            }),
        );

        const batch = JSON.stringify({
            events: [
                validEvent({ requestId: "new-1" }),
                validEvent({ requestId: "new-2" }),
                validEvent({ requestId: "dup" }),
            ],
        });
        await POST(makeRequest(batch, { "x-bursora-key": PLAINTEXT }));

        // 1 (seed) + 2 (new-1, new-2) — the duplicate "dup" does not advance it.
        const counted = await harness.bundleCounter.readMonth({
            workspaceId: WORKSPACE,
            month: MONTH,
        });
        expect(counted).toBe(3);
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

    test("400 when region exceeds 50 chars", async () => {
        const harness = setupHarness();
        const body = JSON.stringify(validEventBody({ region: "a".repeat(51) }));

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        expect(res.status).toBe(400);
        expect(harness.events.rows.length).toBe(0);
    });

    test("400 when region contains disallowed characters", async () => {
        const harness = setupHarness();
        const body = JSON.stringify(validEventBody({ region: "has space" }));

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        expect(res.status).toBe(400);
        expect(harness.events.rows.length).toBe(0);
    });

    test("400 when provider exceeds 64 chars", async () => {
        const harness = setupHarness();
        const body = JSON.stringify(validEventBody({ provider: "p".repeat(65) }));

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        expect(res.status).toBe(400);
        expect(harness.events.rows.length).toBe(0);
    });

    test("400 when model exceeds 128 chars", async () => {
        const harness = setupHarness();
        const body = JSON.stringify(validEventBody({ model: "m".repeat(129) }));

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        expect(res.status).toBe(400);
        expect(harness.events.rows.length).toBe(0);
    });

    test("400 when tenantId exceeds 128 chars", async () => {
        const harness = setupHarness();
        const body = JSON.stringify(validEventBody({ tenantId: "t".repeat(129) }));

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        expect(res.status).toBe(400);
        expect(harness.events.rows.length).toBe(0);
    });

    test("400 when agentId exceeds 128 chars", async () => {
        const harness = setupHarness();
        const body = JSON.stringify(validEventBody({ agentId: "a".repeat(129) }));

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        expect(res.status).toBe(400);
        expect(harness.events.rows.length).toBe(0);
    });

    test("400 when workflowId exceeds 128 chars", async () => {
        const harness = setupHarness();
        const body = JSON.stringify(validEventBody({ workflowId: "w".repeat(129) }));

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        expect(res.status).toBe(400);
        expect(harness.events.rows.length).toBe(0);
    });

    test("400 when requestId exceeds 128 chars", async () => {
        const harness = setupHarness();
        const body = JSON.stringify(validEventBody({ requestId: "r".repeat(129) }));

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        expect(res.status).toBe(400);
        expect(harness.events.rows.length).toBe(0);
    });

    test("400 invalid_body logs sanitized Zod issues with workspace + apiKey id, no raw payload", async () => {
        setupHarness();
        const warn = spyOn(console, "warn").mockImplementation(() => {});
        // Bad payload: provider too long (>64) so the SDK author can see which
        // field violated which constraint without us echoing the raw bytes.
        const rawPayload = "p".repeat(70);
        const body = JSON.stringify({
            events: [
                {
                    provider: rawPayload,
                    model: "gpt-4o",
                    region: "global",
                    promptTokens: 1,
                    completionTokens: 1,
                    cacheTokens: 0,
                    ts: "2025-05-10T12:00:00.000Z",
                },
            ],
        });

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json).toEqual({ error: "invalid_body" });

        const invalidBodyCall = warn.mock.calls.find((c) => c[0] === "v1.invalid_body");
        expect(invalidBodyCall).toBeDefined();
        const payload = invalidBodyCall?.[1] as Record<string, unknown>;
        expect(payload.route).toBe("/api/v1/events");
        expect(payload.workspaceId).toBe(WORKSPACE);
        expect(payload.apiKeyId).toBe(API_KEY_ID);
        const issues = payload.issues as Array<{ path: string; code: string; message: string }>;
        expect(Array.isArray(issues)).toBe(true);
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0]?.path).toBe("events.0.provider");
        expect(typeof issues[0]?.code).toBe("string");
        expect(typeof issues[0]?.message).toBe("string");
        // Raw user payload must never appear in the log entry.
        const serialized = JSON.stringify(payload);
        expect(serialized.includes(rawPayload)).toBe(false);

        warn.mockRestore();
    });

    test("fully-unpriced batch → 202 listing unpriced provider+model, no row persisted", async () => {
        const harness = setupHarness();
        const body = JSON.stringify({
            events: [
                {
                    provider: "openai",
                    model: "gpt-7-unreleased",
                    region: "global",
                    promptTokens: 100,
                    completionTokens: 100,
                    cacheTokens: 0,
                    ts: "2025-05-10T12:00:00.000Z",
                },
            ],
        });

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));
        const json = await res.json();

        // Issue #915: surface the unknown model so the customer's SDK / ops see
        // the gap, but never via a 400 — a 400 makes the fire-and-forget SDK
        // drop the report (it does not retry), losing any priced spend in the
        // batch. Nothing was priceable here, so nothing persists.
        expect(res.status).toBe(202);
        expect(json).toEqual({
            status: "accepted",
            unpriced: [{ provider: "openai", model: "gpt-7-unreleased" }],
        });
        expect(harness.events.rows.length).toBe(0);
    });

    test("mixed batch → 202, priced row persists, unpriced reported, counter bumped by priced count", async () => {
        const harness = setupHarness();
        const body = JSON.stringify({
            events: [
                validEvent({ requestId: "priced-1" }),
                {
                    provider: "openai",
                    model: "gpt-7-unreleased",
                    region: "global",
                    promptTokens: 100,
                    completionTokens: 100,
                    cacheTokens: 0,
                    requestId: "unpriced-1",
                    ts: "2025-05-10T12:00:00.000Z",
                },
            ],
        });

        const res = await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));
        const json = await res.json();

        // Known spend lands; the unpriced sibling is reported, not fatal.
        expect(res.status).toBe(202);
        expect(json).toEqual({
            status: "accepted",
            unpriced: [{ provider: "openai", model: "gpt-7-unreleased" }],
        });
        expect(harness.events.rows.length).toBe(1);
        expect(harness.events.rows[0]?.model).toBe("gpt-4o");

        // Only the priced row advances the plan-bundle counter.
        const counted = await harness.bundleCounter.readMonth({
            workspaceId: WORKSPACE,
            month: MONTH,
        });
        expect(counted).toBe(1);
    });

    test("unknown model → structured server log with sanitized provider+model only", async () => {
        setupHarness();
        const warn = spyOn(console, "warn").mockImplementation(() => {});
        const body = JSON.stringify({
            events: [
                {
                    provider: "openai",
                    model: "gpt-7-unreleased",
                    region: "global",
                    promptTokens: 100,
                    completionTokens: 100,
                    cacheTokens: 0,
                    tenantId: "secret-customer-id",
                    ts: "2025-05-10T12:00:00.000Z",
                },
            ],
        });

        await POST(makeRequest(body, { "x-bursora-key": PLAINTEXT }));

        const call = warn.mock.calls.find((c) => c[0] === "v1.pricing_unknown");
        expect(call).toBeDefined();
        const payload = call?.[1] as Record<string, unknown>;
        expect(payload.route).toBe("/api/v1/events");
        expect(payload.workspaceId).toBe(WORKSPACE);
        expect(payload.apiKeyId).toBe(API_KEY_ID);
        expect(payload.provider).toBe("openai");
        expect(payload.model).toBe("gpt-7-unreleased");
        // No raw event payload (tenantId, token counts, ts) in the log.
        const serialized = JSON.stringify(payload);
        expect(serialized.includes("secret-customer-id")).toBe(false);

        warn.mockRestore();
    });
});
