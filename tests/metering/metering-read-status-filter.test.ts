/**
 * Tests for the optional `status` filter on the metering read repository.
 *
 * Each query method (`spendSeries`, `topSpenders`, `listDistinctValuesBulk`,
 * `countEvents`) accepts `status?: 'ok' | 'blocked' | 'both'`. Default is
 * `'ok'` so existing callers see no behavior change. `'blocked'` returns only
 * blocked rows; `'both'` omits the status predicate entirely.
 *
 * The in-memory fake mirrors the Drizzle semantics row-by-row.
 */

import type { UsageEventRow } from "@/lib/metering";
import { describe, expect, test } from "bun:test";
import { InMemoryMeteringReadRepository } from "./fakes/in-memory-metering-read.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_END = new Date("2025-05-10T12:00:00Z");
const WINDOW_START = new Date(WINDOW_END.getTime() - 24 * HOUR_MS);

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

describe("metering read repository — status filter", () => {
    describe("spendSeries", () => {
        test("default (undefined) returns only ok rows", async () => {
            const repo = new InMemoryMeteringReadRepository();
            repo.add(event({ tenantId: "tenant-A", costUsd: "0.10000000", status: "ok" }));
            repo.add(event({ tenantId: "tenant-A", costUsd: "0.20000000", status: "blocked" }));

            const points = await repo.spendSeries({
                workspaceId: WORKSPACE_A,
                facet: "tenant",
                windowStart: WINDOW_START,
                windowEnd: WINDOW_END,
                bucketSeconds: 3600,
            });

            const tenantA = points.filter((p) => p.tag === "tenant-A");
            expect(tenantA).toHaveLength(1);
            expect(tenantA[0]?.costUsd).toBe("0.10000000");
            expect(tenantA[0]?.callCount).toBe(1);
        });

        test("status='blocked' returns only blocked rows", async () => {
            const repo = new InMemoryMeteringReadRepository();
            repo.add(event({ tenantId: "tenant-A", costUsd: "0.10000000", status: "ok" }));
            repo.add(event({ tenantId: "tenant-A", costUsd: "0.20000000", status: "blocked" }));

            const points = await repo.spendSeries({
                workspaceId: WORKSPACE_A,
                facet: "tenant",
                windowStart: WINDOW_START,
                windowEnd: WINDOW_END,
                bucketSeconds: 3600,
                status: "blocked",
            });

            const tenantA = points.filter((p) => p.tag === "tenant-A");
            expect(tenantA).toHaveLength(1);
            expect(tenantA[0]?.costUsd).toBe("0.20000000");
            expect(tenantA[0]?.callCount).toBe(1);
        });

        test("status='both' returns combined rows", async () => {
            const repo = new InMemoryMeteringReadRepository();
            repo.add(event({ tenantId: "tenant-A", costUsd: "0.10000000", status: "ok" }));
            repo.add(event({ tenantId: "tenant-A", costUsd: "0.20000000", status: "blocked" }));

            const points = await repo.spendSeries({
                workspaceId: WORKSPACE_A,
                facet: "tenant",
                windowStart: WINDOW_START,
                windowEnd: WINDOW_END,
                bucketSeconds: 3600,
                status: "both",
            });

            const tenantA = points.filter((p) => p.tag === "tenant-A");
            expect(tenantA).toHaveLength(1);
            expect(tenantA[0]?.costUsd).toBe("0.30000000");
            expect(tenantA[0]?.callCount).toBe(2);
        });
    });

    describe("topSpenders", () => {
        test("default (undefined) returns only ok rows", async () => {
            const repo = new InMemoryMeteringReadRepository();
            repo.add(event({ tenantId: "tenant-A", costUsd: "0.10000000", status: "ok" }));
            repo.add(event({ tenantId: "tenant-A", costUsd: "0.20000000", status: "blocked" }));

            const rows = await repo.topSpenders({
                workspaceId: WORKSPACE_A,
                facet: "tenant",
                windowStart: WINDOW_START,
                windowEnd: WINDOW_END,
                limit: 10,
            });

            expect(rows).toHaveLength(1);
            expect(rows[0]?.tag).toBe("tenant-A");
            expect(rows[0]?.costUsd).toBe("0.10000000");
            expect(rows[0]?.callCount).toBe(1);
        });

        test("status='blocked' returns only blocked rows", async () => {
            const repo = new InMemoryMeteringReadRepository();
            repo.add(event({ tenantId: "tenant-A", costUsd: "0.10000000", status: "ok" }));
            repo.add(event({ tenantId: "tenant-A", costUsd: "0.20000000", status: "blocked" }));

            const rows = await repo.topSpenders({
                workspaceId: WORKSPACE_A,
                facet: "tenant",
                windowStart: WINDOW_START,
                windowEnd: WINDOW_END,
                limit: 10,
                status: "blocked",
            });

            expect(rows).toHaveLength(1);
            expect(rows[0]?.tag).toBe("tenant-A");
            expect(rows[0]?.costUsd).toBe("0.20000000");
            expect(rows[0]?.callCount).toBe(1);
        });

        test("status='both' returns combined rows", async () => {
            const repo = new InMemoryMeteringReadRepository();
            repo.add(event({ tenantId: "tenant-A", costUsd: "0.10000000", status: "ok" }));
            repo.add(event({ tenantId: "tenant-A", costUsd: "0.20000000", status: "blocked" }));

            const rows = await repo.topSpenders({
                workspaceId: WORKSPACE_A,
                facet: "tenant",
                windowStart: WINDOW_START,
                windowEnd: WINDOW_END,
                limit: 10,
                status: "both",
            });

            expect(rows).toHaveLength(1);
            expect(rows[0]?.tag).toBe("tenant-A");
            expect(rows[0]?.costUsd).toBe("0.30000000");
            expect(rows[0]?.callCount).toBe(2);
        });
    });

    describe("countEvents", () => {
        test("default (undefined) counts only ok rows", async () => {
            const repo = new InMemoryMeteringReadRepository();
            repo.add(event({ status: "ok" }));
            repo.add(event({ status: "ok" }));
            repo.add(event({ status: "blocked" }));

            const count = await repo.countEvents({ workspaceId: WORKSPACE_A });

            expect(count).toBe(2);
        });

        test("status='blocked' counts only blocked rows", async () => {
            const repo = new InMemoryMeteringReadRepository();
            repo.add(event({ status: "ok" }));
            repo.add(event({ status: "ok" }));
            repo.add(event({ status: "blocked" }));

            const count = await repo.countEvents({
                workspaceId: WORKSPACE_A,
                status: "blocked",
            });

            expect(count).toBe(1);
        });

        test("status='both' counts all rows", async () => {
            const repo = new InMemoryMeteringReadRepository();
            repo.add(event({ status: "ok" }));
            repo.add(event({ status: "ok" }));
            repo.add(event({ status: "blocked" }));

            const count = await repo.countEvents({
                workspaceId: WORKSPACE_A,
                status: "both",
            });

            expect(count).toBe(3);
        });
    });

    describe("listDistinctValuesBulk", () => {
        const NOW = new Date("2025-05-10T12:00:00Z");

        test("default (undefined) considers only ok rows", async () => {
            const repo = new InMemoryMeteringReadRepository();
            repo.add(event({ tenantId: "tenant-A", status: "ok" }));
            repo.add(event({ tenantId: "tenant-B", status: "blocked" }));

            const out = await repo.listDistinctValuesBulk({
                workspaceId: WORKSPACE_A,
                scopes: ["tenant"],
                sinceDays: 30,
                limit: 10,
                now: NOW,
            });

            expect(out.tenant).toEqual([{ value: "tenant-A", count: 1 }]);
        });

        test("status='blocked' considers only blocked rows", async () => {
            const repo = new InMemoryMeteringReadRepository();
            repo.add(event({ tenantId: "tenant-A", status: "ok" }));
            repo.add(event({ tenantId: "tenant-B", status: "blocked" }));

            const out = await repo.listDistinctValuesBulk({
                workspaceId: WORKSPACE_A,
                scopes: ["tenant"],
                sinceDays: 30,
                limit: 10,
                now: NOW,
                status: "blocked",
            });

            expect(out.tenant).toEqual([{ value: "tenant-B", count: 1 }]);
        });

        test("status='both' considers all rows", async () => {
            const repo = new InMemoryMeteringReadRepository();
            repo.add(event({ tenantId: "tenant-A", status: "ok" }));
            repo.add(event({ tenantId: "tenant-B", status: "blocked" }));

            const out = await repo.listDistinctValuesBulk({
                workspaceId: WORKSPACE_A,
                scopes: ["tenant"],
                sinceDays: 30,
                limit: 10,
                now: NOW,
                status: "both",
            });

            expect(out.tenant).toEqual([
                { value: "tenant-A", count: 1 },
                { value: "tenant-B", count: 1 },
            ]);
        });
    });
});
