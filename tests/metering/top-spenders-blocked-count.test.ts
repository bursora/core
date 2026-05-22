/**
 * Tests that `topSpenders` exposes a `blockedCount` per tag — the count of
 * `status='blocked'` rows in the window, regardless of the `status` filter
 * passed to the query.
 *
 * Rationale: the /spend dashboard renders a blocked-count column next to
 * cost; pre-computing it in one query (via a conditional aggregate) keeps the
 * page from fanning out a second top-spenders call.
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

describe("topSpenders — blockedCount column", () => {
    test("blockedCount reflects blocked rows when status='ok' (default)", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ tenantId: "tenant-A", status: "ok", costUsd: "0.10000000" }));
        repo.add(event({ tenantId: "tenant-A", status: "ok", costUsd: "0.20000000" }));
        repo.add(event({ tenantId: "tenant-A", status: "blocked", costUsd: "0.00000000" }));
        repo.add(event({ tenantId: "tenant-A", status: "blocked", costUsd: "0.00000000" }));

        const rows = await repo.topSpenders({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            limit: 10,
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]?.callCount).toBe(2);
        expect(rows[0]?.blockedCount).toBe(2);
        expect(rows[0]?.costUsd).toBe("0.30000000");
    });

    test("blockedCount reflects blocked rows when status='blocked'", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ tenantId: "tenant-A", status: "ok", costUsd: "0.10000000" }));
        repo.add(event({ tenantId: "tenant-A", status: "blocked", costUsd: "0.00000000" }));
        repo.add(event({ tenantId: "tenant-A", status: "blocked", costUsd: "0.00000000" }));

        const rows = await repo.topSpenders({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            limit: 10,
            status: "blocked",
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]?.callCount).toBe(2);
        expect(rows[0]?.blockedCount).toBe(2);
    });

    test("blockedCount is zero for tags with no blocked rows in window", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ tenantId: "tenant-A", status: "ok", costUsd: "0.10000000" }));

        const rows = await repo.topSpenders({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            limit: 10,
        });

        expect(rows[0]?.blockedCount).toBe(0);
    });

    test("blockedCount is included when status='both'", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ tenantId: "tenant-A", status: "ok", costUsd: "0.10000000" }));
        repo.add(event({ tenantId: "tenant-A", status: "blocked", costUsd: "0.00000000" }));

        const rows = await repo.topSpenders({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            limit: 10,
            status: "both",
        });

        expect(rows[0]?.callCount).toBe(2);
        expect(rows[0]?.blockedCount).toBe(1);
    });

    test("status='ok' surfaces blockedCount per tag even when other tags only have blocked rows", async () => {
        // Regression for the FILTER-against-already-filtered-WHERE bug. Mixed
        // tags: tenant-A has both ok + blocked rows; tenant-B has only blocked
        // rows. With status='ok', tenant-A must appear with its blocked count
        // reachable, and tenant-B must not appear at all (zero spend = not a
        // top spender).
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ tenantId: "tenant-A", status: "ok", costUsd: "0.10000000" }));
        repo.add(event({ tenantId: "tenant-A", status: "blocked", costUsd: "0.00000000" }));
        repo.add(event({ tenantId: "tenant-A", status: "blocked", costUsd: "0.00000000" }));
        repo.add(event({ tenantId: "tenant-B", status: "blocked", costUsd: "0.00000000" }));

        const rows = await repo.topSpenders({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            limit: 10,
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]?.tag).toBe("tenant-A");
        expect(rows[0]?.callCount).toBe(1);
        expect(rows[0]?.blockedCount).toBe(2);
    });
});
