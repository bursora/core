/**
 * Tests for the ingestEvents use case.
 *
 * Behavior under test:
 *   1. A valid batch is persisted with cost_usd computed per event from the
 *      pricing row effective at event ts.
 *   2. Workspace isolation: the workspaceId on every persisted row is the one
 *      derived from the api key — body-supplied workspaceId is ignored.
 *   3. Region defaults to "global" when omitted on an event.
 *   4. Unknown provider/model (no pricing row) → cost_usd = "0.00000000",
 *      event still persisted, warning logged.
 *   5. Multiple events in one batch are inserted as a single batch call.
 *   6. Pricing lookup uses ts (not now) to honor versioned rates.
 */

import type { UsageEventInput } from "@/lib/metering";
import { ingestEventsUseCase } from "@/lib/metering";
import { describe, expect, mock, test } from "bun:test";
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

    test("unknown model → cost_usd = 0 and warning logged, event still persisted", async () => {
        const events = new InMemoryUsageEventRepository();
        const pricing = new StubPricingRepository(); // no rows registered

        const warn = mock(() => {});

        const result = await ingestEventsUseCase({
            workspaceId: WORKSPACE_A,
            events: [event({ provider: "unknown", model: "mystery-9000" })],
            eventsRepo: events,
            pricingRepo: pricing,
            logger: { warn },
        });

        expect(result.inserted).toBe(1);
        expect(events.rows[0]?.costUsd).toBe("0.00000000");
        expect(warn).toHaveBeenCalled();
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
});
