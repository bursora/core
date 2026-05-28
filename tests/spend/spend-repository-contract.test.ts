/**
 * Contract tests for the unified SpendRepository.
 *
 * Covers both top-level methods through the in-memory fake:
 *   - getSpendForScope: returns a USD sum for one (workspace, scope, window).
 *   - getSpendSeries: returns aggregated (bucket, tag) rows.
 *
 * The aim is that any future Drizzle impl that passes these tests can plug
 * in without breaking existing call sites. The fake here shares its rows
 * with the in-memory metering read repository so existing fixtures keep
 * working.
 */

import type { UsageEventRow } from "@/lib/metering";
import { describe, expect, test } from "bun:test";
import { InMemorySpendRepository } from "./fakes/in-memory-spend.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "99999999-8888-7777-6666-555555555555";

const event = (overrides: Partial<UsageEventRow> = {}): UsageEventRow => ({
    workspaceId: WORKSPACE_A,
    tenantId: null,
    agentId: null,
    workflowId: null,
    provider: "openai",
    model: "gpt-4o",
    promptTokens: 100,
    completionTokens: 50,
    cacheTokens: 0,
    latencyMs: null,
    costUsd: "0.00000000",
    requestId: null,
    ts: new Date("2025-05-10T12:00:00Z"),
    ...overrides,
});

describe("SpendRepository.getSpendForScope", () => {
    test("workspace scope sums all ok events in the window", async () => {
        const repo = new InMemorySpendRepository();
        const from = new Date("2025-05-10T00:00:00Z");
        const to = new Date("2025-05-11T00:00:00Z");

        repo.add(event({ ts: new Date("2025-05-10T08:00:00Z"), costUsd: "1.50000000" }));
        repo.add(event({ ts: new Date("2025-05-10T16:00:00Z"), costUsd: "2.25000000" }));

        const total = await repo.getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from,
            to,
            status: "ok",
        });

        expect(total).toBeCloseTo(3.75, 8);
    });

    test("tenant scope restricts to that tenant id", async () => {
        const repo = new InMemorySpendRepository();
        const from = new Date("2025-05-10T00:00:00Z");
        const to = new Date("2025-05-11T00:00:00Z");

        repo.add(
            event({
                ts: new Date("2025-05-10T08:00:00Z"),
                tenantId: "tenant-A",
                costUsd: "1.00000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T09:00:00Z"),
                tenantId: "tenant-B",
                costUsd: "9.99000000",
            }),
        );

        const total = await repo.getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "tenant",
            scopeId: "tenant-A",
            from,
            to,
            status: "ok",
        });

        expect(total).toBeCloseTo(1, 8);
    });

    test("window is half-open: row at `to` boundary is excluded", async () => {
        const repo = new InMemorySpendRepository();
        const from = new Date("2025-05-10T00:00:00Z");
        const to = new Date("2025-05-11T00:00:00Z");

        repo.add(event({ ts: from, costUsd: "1.00000000" }));
        repo.add(event({ ts: to, costUsd: "9.99000000" })); // on boundary — excluded

        const total = await repo.getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from,
            to,
            status: "ok",
        });

        expect(total).toBeCloseTo(1, 8);
    });

    test("status filter restricts rows: 'ok' ignores blocked", async () => {
        const repo = new InMemorySpendRepository();
        const from = new Date("2025-05-10T00:00:00Z");
        const to = new Date("2025-05-11T00:00:00Z");

        repo.add(
            event({
                ts: new Date("2025-05-10T08:00:00Z"),
                costUsd: "1.00000000",
                status: "ok",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T09:00:00Z"),
                costUsd: "0.50000000",
                status: "blocked",
            }),
        );

        const total = await repo.getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from,
            to,
            status: "ok",
        });

        expect(total).toBeCloseTo(1, 8);
    });

    test("status 'both' includes ok and blocked", async () => {
        const repo = new InMemorySpendRepository();
        const from = new Date("2025-05-10T00:00:00Z");
        const to = new Date("2025-05-11T00:00:00Z");

        repo.add(
            event({
                ts: new Date("2025-05-10T08:00:00Z"),
                costUsd: "1.00000000",
                status: "ok",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T09:00:00Z"),
                costUsd: "0.25000000",
                status: "blocked",
            }),
        );

        const total = await repo.getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from,
            to,
            status: "both",
        });

        expect(total).toBeCloseTo(1.25, 8);
    });

    test("MeteringFilters AND-combine across dimensions", async () => {
        const repo = new InMemorySpendRepository();
        const from = new Date("2025-05-10T00:00:00Z");
        const to = new Date("2025-05-11T00:00:00Z");

        // Matches all four filter dims.
        repo.add(
            event({
                ts: new Date("2025-05-10T10:00:00Z"),
                tenantId: "t1",
                agentId: "a1",
                workflowId: "w1",
                model: "gpt-4o",
                costUsd: "0.10000000",
            }),
        );
        // Wrong model — excluded.
        repo.add(
            event({
                ts: new Date("2025-05-10T11:00:00Z"),
                tenantId: "t1",
                agentId: "a1",
                workflowId: "w1",
                model: "gpt-3.5",
                costUsd: "5.00000000",
            }),
        );

        const total = await repo.getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from,
            to,
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
        const repo = new InMemorySpendRepository();
        const from = new Date("2025-05-10T00:00:00Z");
        const to = new Date("2025-05-11T00:00:00Z");

        repo.add(
            event({
                workspaceId: WORKSPACE_A,
                ts: new Date("2025-05-10T08:00:00Z"),
                costUsd: "1.00000000",
            }),
        );
        repo.add(
            event({
                workspaceId: WORKSPACE_B,
                ts: new Date("2025-05-10T09:00:00Z"),
                costUsd: "9.99000000",
            }),
        );

        const total = await repo.getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from,
            to,
            status: "ok",
        });

        expect(total).toBeCloseTo(1, 8);
    });

    test("returns 0 for empty workspace", async () => {
        const repo = new InMemorySpendRepository();
        const from = new Date("2025-05-10T00:00:00Z");
        const to = new Date("2025-05-11T00:00:00Z");

        const total = await repo.getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from,
            to,
            status: "ok",
        });

        expect(total).toBe(0);
    });
});

describe("SpendRepository.getSpendSeries", () => {
    test("facet='tenant' with 1h bucket groups by (bucket, tenantId) and sums cost", async () => {
        const repo = new InMemorySpendRepository();
        const windowStart = new Date("2025-05-10T00:00:00Z");
        const windowEnd = new Date("2025-05-11T00:00:00Z");

        // Two rows for tenant-A in the same hour bucket.
        repo.add(
            event({
                ts: new Date("2025-05-10T11:10:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.01000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T11:50:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.02000000",
            }),
        );
        // tenant-B in another bucket.
        repo.add(
            event({
                ts: new Date("2025-05-10T10:30:00Z"),
                tenantId: "tenant-B",
                costUsd: "0.05000000",
            }),
        );

        const points = await repo.getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart,
            windowEnd,
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
        const repo = new InMemorySpendRepository();
        const windowStart = new Date("2025-05-10T00:00:00Z");
        const windowEnd = new Date("2025-05-11T00:00:00Z");

        repo.add(
            event({
                ts: new Date("2025-05-10T11:30:00Z"),
                tenantId: null,
                costUsd: "0.07000000",
            }),
        );

        const points = await repo.getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart,
            windowEnd,
            bucketSeconds: 3600,
            status: "ok",
        });

        expect(points).toHaveLength(1);
        expect(points[0]?.tag).toBe("(untagged)");
        expect(points[0]?.costUsd).toBe("0.07000000");
    });

    test("scopeId restricts series to a single facet value", async () => {
        const repo = new InMemorySpendRepository();
        const windowStart = new Date("2025-05-10T00:00:00Z");
        const windowEnd = new Date("2025-05-11T00:00:00Z");

        repo.add(
            event({
                ts: new Date("2025-05-10T11:10:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.01000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T11:20:00Z"),
                tenantId: "tenant-B",
                costUsd: "0.05000000",
            }),
        );

        const points = await repo.getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart,
            windowEnd,
            bucketSeconds: 3600,
            scopeId: "tenant-A",
            status: "ok",
        });

        expect(points).toHaveLength(1);
        expect(points[0]?.tag).toBe("tenant-A");
        expect(points[0]?.costUsd).toBe("0.01000000");
    });

    test("provider MeteringFilter restricts rows", async () => {
        const repo = new InMemorySpendRepository();
        const windowStart = new Date("2025-05-10T00:00:00Z");
        const windowEnd = new Date("2025-05-11T00:00:00Z");

        repo.add(
            event({
                ts: new Date("2025-05-10T11:10:00Z"),
                tenantId: "t1",
                provider: "openai",
                costUsd: "0.01000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T11:20:00Z"),
                tenantId: "t1",
                provider: "anthropic",
                costUsd: "0.99000000",
            }),
        );

        const points = await repo.getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart,
            windowEnd,
            bucketSeconds: 3600,
            status: "ok",
            filters: { provider: ["openai"] },
        });

        expect(points).toHaveLength(1);
        expect(points[0]?.costUsd).toBe("0.01000000");
    });

    test("status='both' includes blocked rows", async () => {
        const repo = new InMemorySpendRepository();
        const windowStart = new Date("2025-05-10T00:00:00Z");
        const windowEnd = new Date("2025-05-11T00:00:00Z");

        repo.add(
            event({
                ts: new Date("2025-05-10T11:10:00Z"),
                tenantId: "t1",
                status: "ok",
                costUsd: "0.10000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T11:20:00Z"),
                tenantId: "t1",
                status: "blocked",
                costUsd: "0.05000000",
            }),
        );

        const points = await repo.getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart,
            windowEnd,
            bucketSeconds: 3600,
            status: "both",
        });

        const total = points
            .filter((p) => p.tag === "t1")
            .reduce((acc, p) => acc + Number.parseFloat(p.costUsd), 0);
        expect(total).toBeCloseTo(0.15, 8);
    });

    test("empty result returns []", async () => {
        const repo = new InMemorySpendRepository();
        const windowStart = new Date("2025-05-10T00:00:00Z");
        const windowEnd = new Date("2025-05-11T00:00:00Z");

        const points = await repo.getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart,
            windowEnd,
            bucketSeconds: 3600,
            status: "ok",
        });

        expect(points).toEqual([]);
    });

    test("points are returned sorted by bucket ascending then tag ascending", async () => {
        const repo = new InMemorySpendRepository();
        const windowStart = new Date("2025-05-10T00:00:00Z");
        const windowEnd = new Date("2025-05-11T00:00:00Z");

        repo.add(
            event({
                ts: new Date("2025-05-10T15:00:00Z"),
                tenantId: "b",
                costUsd: "0.01000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T10:00:00Z"),
                tenantId: "a",
                costUsd: "0.01000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T10:00:00Z"),
                tenantId: "z",
                costUsd: "0.01000000",
            }),
        );

        const points = await repo.getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart,
            windowEnd,
            bucketSeconds: 3600,
            status: "ok",
        });

        const sequence = points.map((p) => `${p.bucket.toISOString()}|${p.tag}`);
        expect(sequence).toEqual([
            "2025-05-10T10:00:00.000Z|a",
            "2025-05-10T10:00:00.000Z|z",
            "2025-05-10T15:00:00.000Z|b",
        ]);
    });
});
