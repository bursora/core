/**
 * DB-backed contract tests for the REAL `drizzleSpendRepository`.
 *
 * Runs the production repo against an in-memory PGlite Postgres with all
 * migrations applied (via the shared `createTestDb` harness), so the SUM /
 * GROUP BY / epoch-floor bucketing / NULLS-FIRST ordering all execute in real
 * SQL. Mirrors the behavior contract of the in-memory twin in
 * `spend-repository-contract.test.ts`.
 *
 * `usage_events` is RANGE-partitioned by `ts`; the harness adds a DEFAULT
 * partition so any timestamp inserts cleanly regardless of when the suite runs.
 */

import { schema } from "@/lib/db";
import { drizzleSpendRepository } from "@/lib/spend/drizzle-spend.repository";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestDb, truncateAll, type TestDbHandle } from "../support/pglite-db";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "99999999-8888-7777-6666-555555555555";

// Every test queries the same one-day window.
const WINDOW_START = new Date("2026-06-10T00:00:00Z");
const WINDOW_END = new Date("2026-06-11T00:00:00Z");

type EventInsert = typeof schema.usageEvents.$inferInsert;

let handle: TestDbHandle;

const repo = () => drizzleSpendRepository(handle.db);

const insertEvent = async (overrides: Partial<EventInsert> = {}): Promise<void> => {
    await handle.db.insert(schema.usageEvents).values({
        workspaceId: WORKSPACE_A,
        provider: "openai",
        model: "gpt-4o",
        promptTokens: 100,
        completionTokens: 50,
        cacheTokens: 0,
        costUsd: "0.00000000",
        status: "ok",
        ts: new Date("2026-06-10T12:00:00Z"),
        ...overrides,
    });
};

beforeAll(async () => {
    handle = await createTestDb();
});

afterAll(async () => {
    await handle.close();
});

beforeEach(async () => {
    await truncateAll(handle.pg);
    await handle.db.insert(schema.workspaces).values([
        { id: WORKSPACE_A, name: "Workspace A" },
        { id: WORKSPACE_B, name: "Workspace B" },
    ]);
});

describe("drizzleSpendRepository.getSpendForScope", () => {
    test("workspace scope sums all ok events in the window", async () => {
        await insertEvent({ ts: new Date("2026-06-10T08:00:00Z"), costUsd: "1.50000000" });
        await insertEvent({ ts: new Date("2026-06-10T16:00:00Z"), costUsd: "2.25000000" });

        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
        });

        expect(total).toBeCloseTo(3.75, 8);
    });

    test("tenant scope restricts to that tenant id", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T08:00:00Z"),
            tenantId: "tenant-A",
            costUsd: "1.00000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T09:00:00Z"),
            tenantId: "tenant-B",
            costUsd: "9.99000000",
        });

        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "tenant",
            scopeId: "tenant-A",
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
        });

        expect(total).toBeCloseTo(1, 8);
    });

    test("window is half-open: row at `to` boundary is excluded", async () => {
        await insertEvent({ ts: WINDOW_START, costUsd: "1.00000000" });
        await insertEvent({ ts: WINDOW_END, costUsd: "9.99000000" }); // on boundary — excluded

        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
        });

        expect(total).toBeCloseTo(1, 8);
    });

    test("status filter restricts rows: 'ok' ignores blocked", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T08:00:00Z"),
            costUsd: "1.00000000",
            status: "ok",
        });
        await insertEvent({
            ts: new Date("2026-06-10T09:00:00Z"),
            costUsd: "0.50000000",
            status: "blocked",
        });

        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
        });

        expect(total).toBeCloseTo(1, 8);
    });

    test("status 'both' includes ok and blocked", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T08:00:00Z"),
            costUsd: "1.00000000",
            status: "ok",
        });
        await insertEvent({
            ts: new Date("2026-06-10T09:00:00Z"),
            costUsd: "0.25000000",
            status: "blocked",
        });

        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "both",
        });

        expect(total).toBeCloseTo(1.25, 8);
    });

    test("MeteringFilters AND-combine across dimensions", async () => {
        // Matches all four filter dims.
        await insertEvent({
            ts: new Date("2026-06-10T10:00:00Z"),
            tenantId: "t1",
            agentId: "a1",
            workflowId: "w1",
            model: "gpt-4o",
            costUsd: "0.10000000",
        });
        // Wrong model — excluded.
        await insertEvent({
            ts: new Date("2026-06-10T11:00:00Z"),
            tenantId: "t1",
            agentId: "a1",
            workflowId: "w1",
            model: "gpt-3.5",
            costUsd: "5.00000000",
        });

        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
            filters: {
                tenantId: ["t1"],
                agentId: ["a1"],
                workflowId: ["w1"],
                model: ["gpt-4o"],
            },
        });

        expect(total).toBeCloseTo(0.1, 8);
    });

    test("workspace isolation: other workspaces never leak", async () => {
        await insertEvent({
            workspaceId: WORKSPACE_A,
            ts: new Date("2026-06-10T08:00:00Z"),
            costUsd: "1.00000000",
        });
        await insertEvent({
            workspaceId: WORKSPACE_B,
            ts: new Date("2026-06-10T09:00:00Z"),
            costUsd: "9.99000000",
        });

        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
        });

        expect(total).toBeCloseTo(1, 8);
    });

    test("returns 0 for empty workspace", async () => {
        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
        });

        expect(total).toBe(0);
    });
});

describe("drizzleSpendRepository.getSpendSeries", () => {
    test("facet='tenant' with 1h bucket groups by (bucket, tenantId) and sums cost", async () => {
        // Two rows for tenant-A in the same hour bucket.
        await insertEvent({
            ts: new Date("2026-06-10T11:10:00Z"),
            tenantId: "tenant-A",
            costUsd: "0.01000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T11:50:00Z"),
            tenantId: "tenant-A",
            costUsd: "0.02000000",
        });
        // tenant-B in another bucket.
        await insertEvent({
            ts: new Date("2026-06-10T10:30:00Z"),
            tenantId: "tenant-B",
            costUsd: "0.05000000",
        });

        const points = await repo().getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            bucketSeconds: 3600,
            status: "ok",
        });

        const aPoint = points.find((p) => p.tag === "tenant-A");
        const bPoint = points.find((p) => p.tag === "tenant-B");
        expect(aPoint?.costUsd).toBe("0.03000000");
        expect(aPoint?.callCount).toBe(2);
        expect(bPoint?.costUsd).toBe("0.05000000");
        expect(bPoint?.callCount).toBe(1);
    });

    test("null facet values are returned as `(untagged)` literal", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T11:30:00Z"),
            tenantId: null,
            costUsd: "0.07000000",
        });

        const points = await repo().getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            bucketSeconds: 3600,
            status: "ok",
        });

        expect(points).toHaveLength(1);
        expect(points[0]?.tag).toBe("(untagged)");
        expect(points[0]?.costUsd).toBe("0.07000000");
    });

    test("epoch-floor buckets align to the hour", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T11:10:00Z"),
            tenantId: "tenant-A",
            costUsd: "0.01000000",
        });

        const points = await repo().getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            bucketSeconds: 3600,
            status: "ok",
        });

        expect(points[0]?.bucket.toISOString()).toBe("2026-06-10T11:00:00.000Z");
    });

    test("scopeId restricts series to a single facet value", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T11:10:00Z"),
            tenantId: "tenant-A",
            costUsd: "0.01000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T11:20:00Z"),
            tenantId: "tenant-B",
            costUsd: "0.05000000",
        });

        const points = await repo().getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            bucketSeconds: 3600,
            scopeId: "tenant-A",
            status: "ok",
        });

        expect(points).toHaveLength(1);
        expect(points[0]?.tag).toBe("tenant-A");
        expect(points[0]?.costUsd).toBe("0.01000000");
    });

    test("provider MeteringFilter restricts rows", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T11:10:00Z"),
            tenantId: "t1",
            provider: "openai",
            costUsd: "0.01000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T11:20:00Z"),
            tenantId: "t1",
            provider: "anthropic",
            costUsd: "0.99000000",
        });

        const points = await repo().getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            bucketSeconds: 3600,
            status: "ok",
            filters: { provider: ["openai"] },
        });

        expect(points).toHaveLength(1);
        expect(points[0]?.costUsd).toBe("0.01000000");
    });

    test("status='both' includes blocked rows", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T11:10:00Z"),
            tenantId: "t1",
            status: "ok",
            costUsd: "0.10000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T11:20:00Z"),
            tenantId: "t1",
            status: "blocked",
            costUsd: "0.05000000",
        });

        const points = await repo().getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            bucketSeconds: 3600,
            status: "both",
        });

        const total = points
            .filter((p) => p.tag === "t1")
            .reduce((acc, p) => acc + Number.parseFloat(p.costUsd), 0);
        expect(total).toBeCloseTo(0.15, 8);
    });

    test("empty result returns []", async () => {
        const points = await repo().getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            bucketSeconds: 3600,
            status: "ok",
        });

        expect(points).toEqual([]);
    });

    test("points are returned sorted by bucket ascending then tag ascending", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T15:00:00Z"),
            tenantId: "b",
            costUsd: "0.01000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T10:00:00Z"),
            tenantId: "a",
            costUsd: "0.01000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T10:00:00Z"),
            tenantId: "z",
            costUsd: "0.01000000",
        });

        const points = await repo().getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            bucketSeconds: 3600,
            status: "ok",
        });

        const sequence = points.map((p) => `${p.bucket.toISOString()}|${p.tag}`);
        expect(sequence).toEqual([
            "2026-06-10T10:00:00.000Z|a",
            "2026-06-10T10:00:00.000Z|z",
            "2026-06-10T15:00:00.000Z|b",
        ]);
    });
});
