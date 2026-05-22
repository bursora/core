/**
 * Tests for the getSpendSeries use case.
 *
 * Behaviors:
 *   1. facet='tenant' over a 24h window → series grouped by (1h bucket, tenantId)
 *   2. facet='model' → series grouped by model
 *   3. Empty workspace → empty points + totalUsd '0.00000000'
 *   4. Untagged events appear under tag '(untagged)' literal
 *   5. Workspace isolation: events from another workspace never leak
 *   6. Window→bucket derivation: 1h span→5min, 24h→1h, 7d→1d, 30d→1d
 */

import type { UsageEventRow } from "@/lib/metering";
import { getSpendSeriesUseCase } from "@/lib/metering";
import { describe, expect, test } from "bun:test";
import { InMemoryMeteringReadRepository } from "./fakes/in-memory-metering-read.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "99999999-8888-7777-6666-555555555555";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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
    ts: new Date("2025-05-10T12:30:00Z"),
    ...overrides,
});

describe("getSpendSeriesUseCase", () => {
    test("facet='tenant' over 24h window groups by 1h bucket + tenantId", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        // Two events for tenant-A in the same 1h bucket → should sum.
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
        // One event for tenant-B in a different bucket.
        repo.add(
            event({
                ts: new Date("2025-05-10T10:30:00Z"),
                tenantId: "tenant-B",
                costUsd: "0.05000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        expect(result.facet).toBe("tenant");
        expect(result.from).toEqual(from);
        expect(result.to).toEqual(to);

        // Zero-filled: 24 buckets × 2 tenants = 48 points.
        expect(result.points.length).toBe(48);

        // Non-zero points carry the aggregated cost; one bucket per tenant.
        const tenantANonZero = result.points.filter(
            (p) => p.tag === "tenant-A" && p.costUsd !== "0.00000000",
        );
        const tenantBNonZero = result.points.filter(
            (p) => p.tag === "tenant-B" && p.costUsd !== "0.00000000",
        );
        expect(tenantANonZero).toHaveLength(1);
        expect(tenantBNonZero).toHaveLength(1);
        expect(tenantANonZero[0]?.costUsd).toBe("0.03000000");
        expect(tenantBNonZero[0]?.costUsd).toBe("0.05000000");
        expect(result.totalUsd).toBe("0.08000000");
    });

    test("facet='model' groups by model", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        repo.add(
            event({
                ts: new Date("2025-05-10T11:30:00Z"),
                model: "gpt-4o",
                costUsd: "0.10000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T11:30:00Z"),
                model: "claude-3-5-sonnet",
                costUsd: "0.20000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "model",
            from,
            to,
            repo,
        });

        const tags = Array.from(new Set(result.points.map((p) => p.tag))).sort();
        expect(tags).toEqual(["claude-3-5-sonnet", "gpt-4o"]);
        expect(result.totalUsd).toBe("0.30000000");
    });

    test("empty workspace returns no points and zero total", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        expect(result.points).toEqual([]);
        expect(result.totalUsd).toBe("0.00000000");
        expect(result.facet).toBe("tenant");
    });

    test("'(untagged)' has a non-zero bucket while tenant-A has its own", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        repo.add(
            event({
                ts: new Date("2025-05-10T11:30:00Z"),
                tenantId: null,
                costUsd: "0.07000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T11:30:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.03000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        const untaggedNonZero = result.points.filter(
            (p) => p.tag === "(untagged)" && p.costUsd !== "0.00000000",
        );
        expect(untaggedNonZero).toHaveLength(1);
        expect(untaggedNonZero[0]?.costUsd).toBe("0.07000000");
    });

    test("workspace isolation: workspaceB events never appear in workspaceA series", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        repo.add(
            event({
                workspaceId: WORKSPACE_A,
                ts: new Date("2025-05-10T11:30:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.05000000",
            }),
        );
        repo.add(
            event({
                workspaceId: WORKSPACE_B,
                ts: new Date("2025-05-10T11:30:00Z"),
                tenantId: "tenant-B",
                costUsd: "9.99000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        // Zero-filled: 24 buckets × 1 tag (tenant-A only).
        expect(result.points.length).toBe(24);
        expect(result.points.every((p) => p.tag === "tenant-A")).toBe(true);
        expect(result.totalUsd).toBe("0.05000000");
    });

    test("1h span uses 5min buckets and a 1h window", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - HOUR_MS);

        // Inside 1h window, two events 8 minutes apart → different 5min buckets.
        repo.add(
            event({
                ts: new Date("2025-05-10T11:32:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.01000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T11:40:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.02000000",
            }),
        );
        // Outside the 1h window: should be excluded.
        repo.add(
            event({
                ts: new Date("2025-05-10T10:00:00Z"),
                tenantId: "tenant-A",
                costUsd: "9.99000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        // 1h window / 5min buckets = 12 buckets × 1 tag.
        expect(result.points.length).toBe(12);
        const nonZero = result.points.filter((p) => p.costUsd !== "0.00000000");
        expect(nonZero.length).toBe(2);
        expect(result.totalUsd).toBe("0.03000000");
    });

    test("7d span uses 1d buckets", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 7 * DAY_MS);

        // Two events on the same UTC day → one bucket.
        repo.add(
            event({
                ts: new Date("2025-05-09T03:00:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.10000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-09T22:00:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.20000000",
            }),
        );
        // Different day → different bucket.
        repo.add(
            event({
                ts: new Date("2025-05-08T10:00:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.50000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        // Aligned 1d buckets from 2025-05-03 through 2025-05-10 = 8 buckets.
        expect(result.points.length).toBe(8);
        const nonZero = result.points.filter((p) => p.costUsd !== "0.00000000");
        expect(nonZero.length).toBe(2);
        expect(result.totalUsd).toBe("0.80000000");
    });

    test("30d span uses 1d buckets and 30d window", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 30 * DAY_MS);

        // Inside 30d
        repo.add(
            event({
                ts: new Date("2025-04-25T12:00:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.40000000",
            }),
        );
        // Outside 30d (35 days back)
        repo.add(
            event({
                ts: new Date("2025-04-05T12:00:00Z"),
                tenantId: "tenant-A",
                costUsd: "9.99000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        expect(result.totalUsd).toBe("0.40000000");
        // Aligned 1d buckets from 2025-04-10 through 2025-05-10 inclusive = 31 buckets.
        expect(result.points.length).toBe(31);
        const nonZero = result.points.filter((p) => p.costUsd !== "0.00000000");
        expect(nonZero.length).toBe(1);
    });

    test("points are returned ordered by bucket ts ascending", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        repo.add(
            event({
                ts: new Date("2025-05-10T11:30:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.01000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T09:30:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.01000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T10:30:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.01000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        const times = result.points.map((p) => p.bucket.getTime());
        const sorted = [...times].sort((a, b) => a - b);
        expect(times).toEqual(sorted);
    });

    test("zero-fills every bucket in the window for each present tag", async () => {
        const repo = new InMemoryMeteringReadRepository();
        // 24h window → 1h buckets → 24 buckets total.
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        // One raw point for tenant-A.
        repo.add(
            event({
                ts: new Date("2025-05-10T11:30:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.04000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        // 24 buckets × 1 tag = 24 points.
        expect(result.points.length).toBe(24);

        // Only one bucket has the actual spend; others are zero.
        const nonZero = result.points.filter((p) => p.costUsd !== "0.00000000");
        expect(nonZero.length).toBe(1);
        expect(nonZero[0]?.tag).toBe("tenant-A");
        expect(nonZero[0]?.costUsd).toBe("0.04000000");

        // Total matches the single contributing point.
        expect(result.totalUsd).toBe("0.04000000");

        // Buckets span the window with bucketSeconds-aligned timestamps.
        const times = result.points.map((p) => p.bucket.getTime());
        const earliest = Math.min(...times);
        const latest = Math.max(...times);
        // Aligned start: floor(from / 3600s) * 3600s = from itself in this case.
        expect(earliest).toBe(from.getTime());
        expect(latest).toBe(to.getTime() - HOUR_MS);
    });

    test("empty raw result yields empty points (no phantom tags)", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        expect(result.points).toEqual([]);
        expect(result.totalUsd).toBe("0.00000000");
    });

    test("FacetedSeries carries bucketSeconds derived from the window", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        // 24h span → 1h buckets.
        expect(result.bucketSeconds).toBe(3600);
    });

    test("zero-fill extends to multiple tags present in raw result", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        repo.add(
            event({
                ts: new Date("2025-05-10T11:30:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.04000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T10:30:00Z"),
                tenantId: "tenant-B",
                costUsd: "0.02000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        // 24 buckets × 2 tags = 48 points.
        expect(result.points.length).toBe(48);

        const tenantAPoints = result.points.filter((p) => p.tag === "tenant-A");
        const tenantBPoints = result.points.filter((p) => p.tag === "tenant-B");
        expect(tenantAPoints.length).toBe(24);
        expect(tenantBPoints.length).toBe(24);
    });

    test("totalCalls sums raw call counts and points carry per-bucket callCount", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        // Three calls in one bucket for tenant-A.
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
                tenantId: "tenant-A",
                costUsd: "0.02000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T11:30:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.03000000",
            }),
        );
        // Two calls in a different bucket for tenant-B.
        repo.add(
            event({
                ts: new Date("2025-05-10T10:10:00Z"),
                tenantId: "tenant-B",
                costUsd: "0.10000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T10:20:00Z"),
                tenantId: "tenant-B",
                costUsd: "0.20000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        // Total is the sum of raw point callCounts (5), NOT zero-fill rows.
        expect(result.totalCalls).toBe(5);

        const tenantANonZero = result.points.filter((p) => p.tag === "tenant-A" && p.callCount > 0);
        const tenantBNonZero = result.points.filter((p) => p.tag === "tenant-B" && p.callCount > 0);
        expect(tenantANonZero).toHaveLength(1);
        expect(tenantANonZero[0]?.callCount).toBe(3);
        expect(tenantBNonZero).toHaveLength(1);
        expect(tenantBNonZero[0]?.callCount).toBe(2);

        // Zero-fill rows must carry callCount: 0.
        const zeroFilled = result.points.filter((p) => p.costUsd === "0.00000000");
        expect(zeroFilled.every((p) => p.callCount === 0)).toBe(true);
    });

    test("totalCalls is zero when no raw points exist", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        expect(result.totalCalls).toBe(0);
    });

    test("zero-fill aligns to bucket boundaries when windowStart is not aligned", async () => {
        const repo = new InMemoryMeteringReadRepository();
        // Span < 2h → 5min buckets (300s). Non-aligned windowStart: 12:17:30Z.
        const from = new Date("2025-05-10T12:17:30Z");
        const to = new Date("2025-05-10T14:00:00Z");

        repo.add(
            event({
                ts: new Date("2025-05-10T12:30:00Z"),
                tenantId: "t1",
                costUsd: "0.01000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
        });

        const bucketMs = 300 * 1000;
        const expectedFirstMs = Math.floor(from.getTime() / bucketMs) * bucketMs;
        const expectedFirstIso = new Date(expectedFirstMs).toISOString();
        expect(expectedFirstIso).toBe("2025-05-10T12:15:00.000Z");

        const times = result.points.map((p) => p.bucket.getTime());
        const earliest = Math.min(...times);
        const latest = Math.max(...times);
        expect(earliest).toBe(expectedFirstMs);
        expect(latest).toBeLessThan(to.getTime());

        const point1230 = result.points.find(
            (p) => p.tag === "t1" && p.bucket.toISOString() === "2025-05-10T12:30:00.000Z",
        );
        expect(point1230).toBeDefined();
        expect(point1230?.callCount).toBe(1);
        expect(point1230?.costUsd).toBe("0.01000000");
    });

    test("scopeId restricts series to a single facet value", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

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

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
            scopeId: "tenant-A",
        });

        // 24 buckets × 1 tag (tenant-A only after scope filter).
        expect(result.points).toHaveLength(24);
        expect(result.points.every((p) => p.tag === "tenant-A")).toBe(true);
        expect(result.totalUsd).toBe("0.01000000");
    });

    test("provider filter restricts series to a single provider", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        repo.add(
            event({
                ts: new Date("2025-05-10T11:10:00Z"),
                tenantId: "tenant-A",
                provider: "openai",
                costUsd: "0.01000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T11:20:00Z"),
                tenantId: "tenant-A",
                provider: "anthropic",
                costUsd: "0.99000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
            provider: ["openai"],
        });

        expect(result.totalUsd).toBe("0.01000000");
    });

    test("AND-combines tenant, agent, workflow, model filters", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        // Matches all four.
        repo.add(
            event({
                ts: new Date("2025-05-10T11:10:00Z"),
                tenantId: "tenant-A",
                agentId: "agent-A",
                workflowId: "wf-A",
                model: "gpt-4o",
                costUsd: "0.02000000",
            }),
        );
        // Wrong agent.
        repo.add(
            event({
                ts: new Date("2025-05-10T11:15:00Z"),
                tenantId: "tenant-A",
                agentId: "agent-B",
                workflowId: "wf-A",
                model: "gpt-4o",
                costUsd: "5.00000000",
            }),
        );
        // Wrong model.
        repo.add(
            event({
                ts: new Date("2025-05-10T11:20:00Z"),
                tenantId: "tenant-A",
                agentId: "agent-A",
                workflowId: "wf-A",
                model: "gpt-3.5",
                costUsd: "7.00000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
            tenantId: ["tenant-A"],
            agentId: ["agent-A"],
            workflowId: ["wf-A"],
            model: ["gpt-4o"],
        });

        expect(result.totalUsd).toBe("0.02000000");
    });

    test("OR-combines multiple values within a dimension (provider in [openai, anthropic])", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - 24 * HOUR_MS);

        repo.add(
            event({
                ts: new Date("2025-05-10T11:10:00Z"),
                tenantId: "tenant-A",
                provider: "openai",
                costUsd: "0.01000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T11:20:00Z"),
                tenantId: "tenant-A",
                provider: "anthropic",
                costUsd: "0.02000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T11:30:00Z"),
                tenantId: "tenant-A",
                provider: "deepseek",
                costUsd: "9.00000000",
            }),
        );

        const result = await getSpendSeriesUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            repo,
            provider: ["openai", "anthropic"],
        });

        expect(result.totalUsd).toBe("0.03000000");
    });
});
