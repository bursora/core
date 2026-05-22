/**
 * Tests for `MeteringReadRepository.cumulativeSpendDaily`.
 *
 * Returns one running-total dollar value per UTC day in `[from, to)`, for the
 * given workspace + scope + 'ok'-only rows. Replaces the page-side raw
 * `db()` query that loaded all in-period events and reduced them in JS — the
 * new method buckets in SQL.
 */

import type { UsageEventRow } from "@/lib/metering";
import { describe, expect, test } from "bun:test";
import { InMemoryMeteringReadRepository } from "./fakes/in-memory-metering-read.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "22222222-3333-4444-5555-666666666666";

const event = (overrides: Partial<UsageEventRow> = {}): UsageEventRow => ({
    workspaceId: WORKSPACE_A,
    tenantId: null,
    agentId: null,
    workflowId: null,
    provider: "openai",
    model: "gpt-4o",
    promptTokens: 0,
    completionTokens: 0,
    cacheTokens: 0,
    latencyMs: null,
    costUsd: "0.00000000",
    requestId: null,
    ts: new Date("2025-01-01T00:00:00.000Z"),
    ...overrides,
});

describe("cumulativeSpendDaily", () => {
    test("returns an empty period with no events as a zero-length series", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const series = await repo.cumulativeSpendDaily({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: new Date("2025-01-01T00:00:00.000Z"),
            to: new Date("2025-01-01T00:00:00.000Z"),
        });
        expect(series).toEqual([]);
    });

    test("returns one zero point per day for an empty event list", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const series = await repo.cumulativeSpendDaily({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: new Date("2025-01-01T00:00:00.000Z"),
            to: new Date("2025-01-04T00:00:00.000Z"),
        });
        expect(series).toEqual([0, 0, 0]);
    });

    test("single-day period sums all events in that day", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ ts: new Date("2025-01-01T03:00:00Z"), costUsd: "0.50000000" }));
        repo.add(event({ ts: new Date("2025-01-01T20:00:00Z"), costUsd: "0.25000000" }));

        const series = await repo.cumulativeSpendDaily({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: new Date("2025-01-01T00:00:00.000Z"),
            to: new Date("2025-01-02T00:00:00.000Z"),
        });
        expect(series).toHaveLength(1);
        expect(series[0]).toBeCloseTo(0.75, 8);
    });

    test("accumulates a running total across multiple days", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ ts: new Date("2025-01-01T03:00:00Z"), costUsd: "1.00000000" }));
        repo.add(event({ ts: new Date("2025-01-02T12:00:00Z"), costUsd: "2.00000000" }));
        repo.add(event({ ts: new Date("2025-01-03T09:00:00Z"), costUsd: "0.50000000" }));

        const series = await repo.cumulativeSpendDaily({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: new Date("2025-01-01T00:00:00.000Z"),
            to: new Date("2025-01-04T00:00:00.000Z"),
        });
        expect(series).toHaveLength(3);
        expect(series[0]).toBeCloseTo(1, 8);
        expect(series[1]).toBeCloseTo(3, 8);
        expect(series[2]).toBeCloseTo(3.5, 8);
    });

    test("excludes blocked rows (status='ok' filter)", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(
            event({ ts: new Date("2025-01-01T03:00:00Z"), costUsd: "1.00000000", status: "ok" }),
        );
        repo.add(
            event({
                ts: new Date("2025-01-01T04:00:00Z"),
                costUsd: "9.00000000",
                status: "blocked",
            }),
        );

        const series = await repo.cumulativeSpendDaily({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: new Date("2025-01-01T00:00:00.000Z"),
            to: new Date("2025-01-02T00:00:00.000Z"),
        });
        expect(series).toHaveLength(1);
        expect(series[0]).toBeCloseTo(1, 8);
    });

    test("isolates workspace: rows from another workspace are excluded", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(
            event({
                workspaceId: WORKSPACE_A,
                ts: new Date("2025-01-01T03:00:00Z"),
                costUsd: "1.00000000",
            }),
        );
        repo.add(
            event({
                workspaceId: WORKSPACE_B,
                ts: new Date("2025-01-01T04:00:00Z"),
                costUsd: "99.00000000",
            }),
        );

        const series = await repo.cumulativeSpendDaily({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: new Date("2025-01-01T00:00:00.000Z"),
            to: new Date("2025-01-02T00:00:00.000Z"),
        });
        expect(series).toHaveLength(1);
        expect(series[0]).toBeCloseTo(1, 8);
    });

    test("isolates scope: tenant filter picks only matching tenant rows", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(
            event({
                tenantId: "acme",
                ts: new Date("2025-01-01T03:00:00Z"),
                costUsd: "2.00000000",
            }),
        );
        repo.add(
            event({
                tenantId: "other",
                ts: new Date("2025-01-01T04:00:00Z"),
                costUsd: "5.00000000",
            }),
        );

        const series = await repo.cumulativeSpendDaily({
            workspaceId: WORKSPACE_A,
            scopeType: "tenant",
            scopeId: "acme",
            from: new Date("2025-01-01T00:00:00.000Z"),
            to: new Date("2025-01-02T00:00:00.000Z"),
        });
        expect(series).toHaveLength(1);
        expect(series[0]).toBeCloseTo(2, 8);
    });

    test("isolates scope: agent filter picks only matching agent rows", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(
            event({ agentId: "a1", ts: new Date("2025-01-01T03:00:00Z"), costUsd: "2.00000000" }),
        );
        repo.add(
            event({ agentId: "a2", ts: new Date("2025-01-01T04:00:00Z"), costUsd: "5.00000000" }),
        );

        const series = await repo.cumulativeSpendDaily({
            workspaceId: WORKSPACE_A,
            scopeType: "agent",
            scopeId: "a1",
            from: new Date("2025-01-01T00:00:00.000Z"),
            to: new Date("2025-01-02T00:00:00.000Z"),
        });
        expect(series).toHaveLength(1);
        expect(series[0]).toBeCloseTo(2, 8);
    });

    test("isolates scope: workflow filter picks only matching workflow rows", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(
            event({
                workflowId: "w1",
                ts: new Date("2025-01-01T03:00:00Z"),
                costUsd: "2.00000000",
            }),
        );
        repo.add(
            event({
                workflowId: "w2",
                ts: new Date("2025-01-01T04:00:00Z"),
                costUsd: "5.00000000",
            }),
        );

        const series = await repo.cumulativeSpendDaily({
            workspaceId: WORKSPACE_A,
            scopeType: "workflow",
            scopeId: "w1",
            from: new Date("2025-01-01T00:00:00.000Z"),
            to: new Date("2025-01-02T00:00:00.000Z"),
        });
        expect(series).toHaveLength(1);
        expect(series[0]).toBeCloseTo(2, 8);
    });
});
