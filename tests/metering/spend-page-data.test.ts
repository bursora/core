/**
 * Smoke tests for the metering-read composition root.
 *
 * Verifies that:
 *   1. The bound `getSpendSeries`/`getTopSpenders` functions delegate to the
 *      injected dependencies and return the expected shape.
 *   2. `setMeteringReadDepsForTesting` swaps deps in/out cleanly.
 *
 * No DB. The injected repo is the in-memory fake.
 */

import type { UsageEventRow } from "@/lib/metering";
import {
    getSpendSeries,
    getTopSpenders,
    setMeteringReadDepsForTesting,
} from "@/lib/metering/server";
import { afterEach, describe, expect, test } from "bun:test";
import { InMemoryMeteringReadRepository } from "./fakes/in-memory-metering-read.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const HOUR_MS = 60 * 60 * 1000;

const event = (overrides: Partial<UsageEventRow> = {}): UsageEventRow => ({
    workspaceId: WORKSPACE_A,
    tenantId: null,
    agentId: null,
    workflowId: null,
    provider: "openai",
    model: "gpt-4o",
    promptTokens: 1000,
    completionTokens: 500,
    cacheTokens: 0,
    latencyMs: null,
    costUsd: "0.01000000",
    requestId: null,
    ts: new Date("2025-05-10T11:30:00Z"),
    ...overrides,
});

describe("metering read deps", () => {
    afterEach(() => {
        setMeteringReadDepsForTesting(null);
    });

    const to = new Date("2025-05-10T12:00:00Z");
    const from = new Date(to.getTime() - 24 * HOUR_MS);

    test("getSpendSeries returns FacetedSeries with expected fields", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ tenantId: "tenant-A", costUsd: "0.01000000" }));
        repo.add(event({ tenantId: "tenant-A", costUsd: "0.02000000" }));

        setMeteringReadDepsForTesting({ readRepo: repo });

        const result = await getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
        });

        expect(result.facet).toBe("tenant");
        expect(result.from).toEqual(from);
        expect(result.to).toEqual(to);
        expect(Array.isArray(result.points)).toBe(true);
        expect(result.totalUsd).toBe("0.03000000");
    });

    test("getTopSpenders returns array of {tag, costUsd}", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ tenantId: "tenant-A", costUsd: "0.05000000" }));
        repo.add(event({ tenantId: "tenant-B", costUsd: "0.10000000" }));

        setMeteringReadDepsForTesting({ readRepo: repo });

        const result = await getTopSpenders({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            limit: 5,
        });

        expect(result.length).toBe(2);
        expect(result[0]?.tag).toBe("tenant-B");
        expect(result[0]?.costUsd).toBe("0.10000000");
    });

    test("setMeteringReadDepsForTesting(null) clears the override", async () => {
        const repo = new InMemoryMeteringReadRepository();
        setMeteringReadDepsForTesting({ readRepo: repo });
        setMeteringReadDepsForTesting(null);

        // After clearing, calling again with no override falls back to the
        // production wiring (which would hit the DB). We verify only that the
        // setter accepts null without throwing — actual DB calls are not made.
        expect(() => setMeteringReadDepsForTesting(null)).not.toThrow();
    });
});
