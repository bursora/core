/**
 * Metering feature integration test.
 *
 * Drives the public API exposed by `@/lib/metering` — the same surface
 * `app/` and other features consume. Uses in-memory fakes for the use-case
 * flows; lower-level tests in `tests/metering/` cover the deep paths.
 */

import { usageEvents } from "@/lib/db/schema";
import {
    getSpendSeriesUseCase,
    getTopSpendersUseCase,
    ingestEventsUseCase,
    pruneEvents,
    UNTAGGED,
    type UsageEventInput,
} from "@/lib/metering";
import { InMemoryMeteringReadRepository } from "@/tests/metering/fakes/in-memory-metering-read.repository";
import { InMemoryUsageEventRepository } from "@/tests/metering/fakes/in-memory-usage-event.repository";
import { StubPricingRepository } from "@/tests/metering/fakes/stub-pricing.repository";
import { describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

const sampleEvent = (overrides: Partial<UsageEventInput> = {}): UsageEventInput => ({
    provider: "openai",
    model: "gpt-4o",
    region: "global",
    promptTokens: 1000,
    completionTokens: 500,
    cacheTokens: 0,
    ts: new Date("2025-01-15T12:00:00Z"),
    tenantId: "tenant-a",
    agentId: null,
    workflowId: null,
    latencyMs: null,
    requestId: null,
    ...overrides,
});

describe("@/lib/metering public API", () => {
    test("schema table is re-exported", () => {
        expect(usageEvents).toBeDefined();
    });

    test("UNTAGGED literal is re-exported for facet pages", () => {
        expect(UNTAGGED).toBeDefined();
        expect(typeof UNTAGGED).toBe("string");
    });

    test("ingest roundtrip: pricing lookup → cost → persist", async () => {
        const eventsRepo = new InMemoryUsageEventRepository();
        const pricingRepo = new StubPricingRepository();
        pricingRepo.addRow({
            id: "p-1",
            workspaceId: null,
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "5",
            outputPer1mUsd: "15",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2024-01-01T00:00:00Z"),
            effectiveTo: null,
        });

        const summary = await ingestEventsUseCase({
            workspaceId: WORKSPACE,
            events: [sampleEvent({ promptTokens: 1000, completionTokens: 1000 })],
            eventsRepo,
            pricingRepo,
        });

        expect(summary.inserted).toBe(1);
        expect(eventsRepo.rows).toHaveLength(1);
        const row = eventsRepo.rows[0];
        expect(row).toBeDefined();
        expect(row!.workspaceId).toBe(WORKSPACE);
        // 1000 * 5/1_000_000 + 1000 * 15/1_000_000 = 0.02
        expect(row!.costUsd).toBe("0.02000000");
    });

    test("spend reads: series, top-spenders, count", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const now = new Date("2025-01-15T12:00:00Z");
        const rows = [
            {
                workspaceId: WORKSPACE,
                tenantId: "tenant-a",
                agentId: null,
                workflowId: null,
                provider: "openai",
                model: "gpt-4o",
                promptTokens: 1000,
                completionTokens: 500,
                cacheTokens: 0,
                latencyMs: null,
                costUsd: "1.00000000",
                requestId: null,
                ts: new Date(now.getTime() - 60 * 1000),
            },
            {
                workspaceId: WORKSPACE,
                tenantId: "tenant-b",
                agentId: null,
                workflowId: null,
                provider: "openai",
                model: "gpt-4o",
                promptTokens: 500,
                completionTokens: 250,
                cacheTokens: 0,
                latencyMs: null,
                costUsd: "0.50000000",
                requestId: null,
                ts: new Date(now.getTime() - 5 * 60 * 1000),
            },
        ];
        for (const row of rows) repo.add(row);

        const series = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE,
            facet: "tenant",
            from: new Date(now.getTime() - 60 * 60 * 1000),
            to: now,
            repo,
        });
        expect(series).toBeDefined();

        const top = await getTopSpendersUseCase({
            workspaceId: WORKSPACE,
            facet: "tenant",
            from: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            to: now,
            limit: 10,
            repo,
        });
        expect(top.length).toBeGreaterThanOrEqual(1);
        expect(top[0]!.costUsd).toBe("1.00000000");

        const count = await repo.countEvents({ workspaceId: WORKSPACE });
        expect(count).toBe(2);
    });

    test("pruneEvents partition rollover entry is re-exported", () => {
        expect(typeof pruneEvents).toBe("function");
    });
});
