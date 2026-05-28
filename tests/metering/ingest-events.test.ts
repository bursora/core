/**
 * Tests for the ingestEvents use case.
 *
 * Behavior under test:
 *   1. A valid batch is persisted with cost_usd computed per event from the
 *      pricing row effective at event ts.
 *   2. Workspace isolation: the workspaceId on every persisted row is the one
 *      derived from the api key — body-supplied workspaceId is ignored.
 *   3. Unknown provider/model (no pricing row) → throws UnknownPricingError
 *      with provider+model context; nothing persists (no silent zero-billing).
 *   4. Multiple events in one batch are inserted as a single batch call.
 *   5. Pricing lookup uses ts (not now) to honor versioned rates.
 *   6. Idempotency: replaying the same (workspace, requestId) does not insert
 *      a duplicate row (issue #914).
 */

import type { UsageEventInput } from "@/lib/metering";
import { ingestEventsUseCase } from "@/lib/metering";
import { UnknownPricingError } from "@/lib/metering/pricing/calculate-cost";
import { money } from "@/lib/metering/pricing/money";
import type { PricingResolver } from "@/lib/metering/pricing/pricing-resolver";
import { describe, expect, test } from "bun:test";
import { InMemoryUsageEventRepository } from "./fakes/in-memory-usage-event.repository";
import { StubPricingRepository } from "./fakes/stub-pricing.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "99999999-8888-7777-6666-555555555555";

const event = (overrides: Partial<UsageEventInput> = {}): UsageEventInput => ({
    provider: "openai",
    model: "gpt-4o",
    region: "global",
    promptTokens: 1000,
    completionTokens: 500,
    cacheTokens: 0,
    ts: new Date("2025-05-10T12:00:00Z"),
    tenantId: null,
    agentId: null,
    workflowId: null,
    latencyMs: null,
    requestId: null,
    ...overrides,
});

describe("ingestEventsUseCase", () => {
    test("persists every event with cost computed from the matching pricing row", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository();
        pricing.addRow({
            id: "row-1",
            workspaceId: null,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "2.5",
            outputPer1mUsd: "10",
            cachePer1mUsd: "1.25",
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });

        const result = await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [event()],
            eventsRepo: events,
            pricingRepo: pricing,
        });

        expect(result.inserted).toBe(1);
        expect(events.rows.length).toBe(1);
        // 1000*2.5/1_000_000 + 500*10/1_000_000 = 0.0025 + 0.005 = 0.0075
        expect(events.rows[0]?.costUsd).toBe("0.00750000");
    });

    test("workspaceId is the api-key-derived value (not from body)", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository();
        pricing.addRow({
            id: "row-1",
            workspaceId: null,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "2.5",
            outputPer1mUsd: "10",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });

        await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [event()],
            eventsRepo: events,
            pricingRepo: pricing,
        });

        expect(events.rows[0]?.workspaceId).toBe(WORKSPACE_A);
        expect(events.rows[0]?.workspaceId).not.toBe(WORKSPACE_B);
    });

    test("unknown model → throws UnknownPricingError carrying provider+model, no rows persisted", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository(); // no rows registered

        let caught: unknown = null;
        try {
            await ingestEventsUseCase({
                workspaceId: WORKSPACE_A,
                events: [event({ provider: "openai", model: "gpt-7-unreleased" })],
                eventsRepo: events,
                pricingRepo: pricing,
            });
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(UnknownPricingError);
        const err = caught as UnknownPricingError;
        expect(err.provider).toBe("openai");
        expect(err.model).toBe("gpt-7-unreleased");

        // SAFE: no partial write. The batch must roll back so the customer
        // does not see "some events accepted, some rejected" silently.
        expect(events.rows.length).toBe(0);
        expect(events.batchInsertCalls).toBe(0);
    });

    test("unknown pricing in a mixed batch → entire batch rejected (no partial write)", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository();
        pricing.addRow({
            id: "row-1",
            workspaceId: null,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "2.5",
            outputPer1mUsd: "10",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });

        let caught: unknown = null;
        try {
            await ingestEventsUseCase({
                workspaceId: WORKSPACE_A,
                events: [
                    event({ provider: "openai", model: "gpt-4o" }),
                    event({ provider: "openai", model: "gpt-7-unreleased" }),
                ],
                eventsRepo: events,
                pricingRepo: pricing,
            });
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(UnknownPricingError);
        expect(events.rows.length).toBe(0);
        expect(events.batchInsertCalls).toBe(0);
    });

    test("uses pricing row effective AT event ts (not the latest)", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository();
        pricing.addRow({
            id: "old",
            workspaceId: null,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "1",
            outputPer1mUsd: "1",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2023-01-01T00:00:00Z"),
            effectiveTo: new Date("2024-01-01T00:00:00Z"),
        });
        pricing.addRow({
            id: "current",
            workspaceId: null,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "5",
            outputPer1mUsd: "5",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });

        await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [event({ ts: new Date("2023-06-01T00:00:00Z") })],
            eventsRepo: events,
            pricingRepo: pricing,
        });

        // Should use OLD row ($1/1M): 1000*1/1_000_000 + 500*1/1_000_000 = 0.0015
        expect(events.rows[0]?.costUsd).toBe("0.00150000");
    });

    test("batch of multiple events is persisted in one call", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository();
        pricing.addRow({
            id: "row-1",
            workspaceId: null,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "2.5",
            outputPer1mUsd: "10",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });

        await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [event(), event(), event()],
            eventsRepo: events,
            pricingRepo: pricing,
        });

        expect(events.batchInsertCalls).toBe(1);
        expect(events.rows.length).toBe(3);
    });

    test("returns inserted count of zero for empty batch", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository();

        const result = await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [],
            eventsRepo: events,
            pricingRepo: pricing,
        });

        expect(result.inserted).toBe(0);
        expect(events.batchInsertCalls).toBe(0);
    });

    test("same (workspace, requestId) replayed → second call does not insert a duplicate", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository();
        pricing.addRow({
            id: "row-1",
            workspaceId: null,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "2.5",
            outputPer1mUsd: "10",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });

        const replayed = event({ requestId: "req-abc" });

        await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [replayed],
            eventsRepo: events,
            pricingRepo: pricing,
        });
        await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [replayed],
            eventsRepo: events,
            pricingRepo: pricing,
        });

        // SAFE-not-sorry: do not double-bill. Only one row, regardless of how
        // many times the SDK retries with the same requestId.
        expect(events.rows.length).toBe(1);
    });

    test("replayed requestId → inserted count reflects rows actually written, not input length", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository();
        pricing.addRow({
            id: "row-1",
            workspaceId: null,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "2.5",
            outputPer1mUsd: "10",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });

        const replayed = event({ requestId: "req-abc" });

        const first = await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [replayed],
            eventsRepo: events,
            pricingRepo: pricing,
        });
        const second = await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [replayed],
            eventsRepo: events,
            pricingRepo: pricing,
        });

        // First delivery persists; the retry dedups. The bundle counter is
        // driven by `inserted`, so the replay must report 0 (issue #1002).
        expect(first.inserted).toBe(1);
        expect(second.inserted).toBe(0);
    });

    test("mixed batch [new, new, duplicate] → inserted count is 2", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository();
        pricing.addRow({
            id: "row-1",
            workspaceId: null,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "2.5",
            outputPer1mUsd: "10",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });

        // Seed the row that the duplicate in the next batch will collide with.
        await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [event({ requestId: "dup" })],
            eventsRepo: events,
            pricingRepo: pricing,
        });

        const result = await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [
                event({ requestId: "new-1" }),
                event({ requestId: "new-2" }),
                event({ requestId: "dup" }),
            ],
            eventsRepo: events,
            pricingRepo: pricing,
        });

        expect(result.inserted).toBe(2);
        expect(events.rows.length).toBe(3);
    });

    test("null requestId rows are never deduped — both inserts land", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository();
        pricing.addRow({
            id: "row-1",
            workspaceId: null,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "2.5",
            outputPer1mUsd: "10",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });

        await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [event({ requestId: null })],
            eventsRepo: events,
            pricingRepo: pricing,
        });
        await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [event({ requestId: null })],
            eventsRepo: events,
            pricingRepo: pricing,
        });

        // Pre-existing SDK behavior: requestId is optional. Rows without one
        // can not be deduped — each delivery records its own row.
        expect(events.rows.length).toBe(2);
    });

    test("injected PricingResolver decides cost — no pricing repo touched", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository(); // intentionally empty
        const resolver: PricingResolver = {
            async resolveCost() {
                return money(0.42);
            },
        };

        const result = await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [event()],
            eventsRepo: events,
            pricingRepo: pricing,
            pricingResolver: resolver,
        });

        // The injected resolver short-circuits lookup+find+calculate. Empty
        // StubPricingRepository would have produced UnknownPricingError if
        // ingestEvents had fallen through to the trio.
        expect(result.inserted).toBe(1);
        expect(events.rows[0]?.costUsd).toBe("0.42000000");
    });

    test("injected PricingResolver throwing UnknownPricingError aborts the batch", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository();
        const resolver: PricingResolver = {
            async resolveCost(input) {
                throw new UnknownPricingError({
                    provider: input.provider,
                    model: input.model,
                });
            },
        };

        let caught: unknown = null;
        try {
            await ingestEventsUseCase({
                workspaceId: WORKSPACE_A,
                events: [event({ provider: "openai", model: "mystery-model" })],
                eventsRepo: events,
                pricingRepo: pricing,
                pricingResolver: resolver,
            });
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(UnknownPricingError);
        const err = caught as UnknownPricingError;
        expect(err.provider).toBe("openai");
        expect(err.model).toBe("mystery-model");
        expect(events.rows.length).toBe(0);
        expect(events.batchInsertCalls).toBe(0);
    });

    test("same requestId in different workspaces does NOT dedupe", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository();
        pricing.addRow({
            id: "row-1",
            workspaceId: null,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "2.5",
            outputPer1mUsd: "10",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });

        await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [event({ requestId: "req-abc" })],
            eventsRepo: events,
            pricingRepo: pricing,
        });
        await ingestEventsUseCase({
            workspaceId: WORKSPACE_B,
            events: [event({ requestId: "req-abc" })],
            eventsRepo: events,
            pricingRepo: pricing,
        });

        // Tenant isolation: the unique index is partial on (workspace, requestId),
        // so two distinct workspaces never collide.
        expect(events.rows.length).toBe(2);
    });
});
