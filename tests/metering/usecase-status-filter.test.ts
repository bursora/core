/**
 * Verifies the metering use cases propagate the optional `status` filter to
 * the repository. The repository layer already implements `'ok' | 'blocked' |
 * 'both'`; these tests pin the use-case wiring so dashboard callers can pass
 * `status` end-to-end.
 */

import type { UsageEventRow } from "@/lib/metering";
import { getSpendSeriesUseCase, getTopSpendersUseCase } from "@/lib/metering";
import { describe, expect, test } from "bun:test";
import { InMemoryMeteringReadRepository } from "./fakes/in-memory-metering-read.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";

const HOUR_MS = 60 * 60 * 1000;

const event = (overrides: Partial<UsageEventRow> = {}): UsageEventRow => ({
    workspaceId: WORKSPACE_A,
    tenantId: "tenant-A",
    agentId: null,
    workflowId: null,
    provider: "openai",
    model: "gpt-4o",
    promptTokens: 100,
    completionTokens: 50,
    cacheTokens: 0,
    latencyMs: null,
    costUsd: "0.01000000",
    requestId: null,
    ts: new Date("2025-05-10T11:30:00Z"),
    ...overrides,
});

const to = new Date("2025-05-10T12:00:00Z");
const from = new Date(to.getTime() - 24 * HOUR_MS);

describe("metering use cases — status filter", () => {
    test("getSpendSeriesUseCase passes status='blocked' through to repo", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ status: "ok", costUsd: "0.10000000" }));
        repo.add(event({ status: "blocked", costUsd: "0.20000000" }));

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
            status: "blocked",
        });

        expect(result.totalCalls).toBe(1);
        expect(result.totalUsd).toBe("0.20000000");
    });

    test("getSpendSeriesUseCase passes status='both' through to repo", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ status: "ok", costUsd: "0.10000000" }));
        repo.add(event({ status: "blocked", costUsd: "0.20000000" }));

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
            status: "both",
        });

        expect(result.totalCalls).toBe(2);
        expect(result.totalUsd).toBe("0.30000000");
    });

    test("getTopSpendersUseCase passes status='blocked' through to repo", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ status: "ok", costUsd: "0.10000000" }));
        repo.add(event({ status: "blocked", costUsd: "0.20000000" }));

        const result = await getTopSpendersUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            limit: 10,
            repo,
            status: "blocked",
        });

        expect(result.length).toBe(1);
        expect(result[0]?.costUsd).toBe("0.20000000");
        expect(result[0]?.callCount).toBe(1);
    });
});
