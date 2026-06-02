/**
 * The spend-counter increment is wired into the metering ingest path and shares
 * its single dedup decision: a retried `(workspace, requestId)` delivery is
 * dropped before the sink, so it neither inserts a second row nor increments the
 * counter twice.
 */

import { type UsageEventInput } from "@/lib/metering";
import { ingestEventsUseCase } from "@/lib/metering/ingest-events.usecase";
import { createSpendCounter } from "@/lib/spend-counter";
import { beforeEach, describe, expect, test } from "bun:test";
import { InMemoryRequestDedupGuard } from "../metering/fakes/in-memory-request-dedup.guard";
import { InMemoryUsageEventRepository } from "../metering/fakes/in-memory-usage-event.repository";
import { StubPricingRepository } from "../metering/fakes/stub-pricing.repository";
import { InMemorySpendRepository } from "../spend/fakes/in-memory-spend.repository";
import { InMemorySpendCounterStore } from "./fakes/in-memory-spend-counter.store";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const TS = new Date("2026-06-10T12:00:00Z");

const event = (overrides: Partial<UsageEventInput> = {}): UsageEventInput => ({
    provider: "openai",
    model: "gpt-4o",
    region: "global",
    promptTokens: 1000,
    completionTokens: 500,
    cacheTokens: 0,
    ts: TS,
    tenantId: null,
    agentId: null,
    workflowId: null,
    latencyMs: null,
    requestId: null,
    ...overrides,
});

// 1000 * 2.5/1M + 500 * 10/1M = 0.0075
const PRICING_ROW = {
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
};

let events: InMemoryUsageEventRepository;
let pricing: StubPricingRepository;
let dedup: InMemoryRequestDedupGuard;
let store: InMemorySpendCounterStore;
let spend: InMemorySpendRepository;

beforeEach(() => {
    events = new InMemoryUsageEventRepository();
    pricing = new StubPricingRepository();
    pricing.addRow(PRICING_ROW);
    dedup = new InMemoryRequestDedupGuard();
    store = new InMemorySpendCounterStore();
    spend = new InMemorySpendRepository();
});

const readWorkspaceDaily = (counter: ReturnType<typeof createSpendCounter>): Promise<number> =>
    counter.read({
        workspaceId: WORKSPACE,
        scopeType: "workspace",
        scopeId: null,
        period: "daily",
        now: TS,
    });

describe("ingest wires the spend-counter increment", () => {
    test("a successful insert bumps the workspace counter", async () => {
        const counter = createSpendCounter({ store, spend });
        await readWorkspaceDaily(counter); // prime the window

        await ingestEventsUseCase({
            workspaceId: WORKSPACE,
            events: [event({ requestId: "req-1" })],
            eventsRepo: events,
            pricingRepo: pricing,
            dedup,
            spendCounter: counter,
            now: TS,
        });

        expect(events.rows.length).toBe(1);
        expect(await readWorkspaceDaily(counter)).toBeCloseTo(0.0075, 8);
    });

    test("a replayed requestId increments the counter only once", async () => {
        const counter = createSpendCounter({ store, spend });
        await readWorkspaceDaily(counter); // prime the window

        const replayed = event({ requestId: "req-1" });
        const input = {
            workspaceId: WORKSPACE,
            events: [replayed],
            eventsRepo: events,
            pricingRepo: pricing,
            dedup,
            spendCounter: counter,
            now: TS,
        };

        await ingestEventsUseCase(input);
        await ingestEventsUseCase(input);

        // One insert, one increment — the shared dedup decision covers both.
        expect(events.rows.length).toBe(1);
        expect(await readWorkspaceDaily(counter)).toBeCloseTo(0.0075, 8);
    });
});
