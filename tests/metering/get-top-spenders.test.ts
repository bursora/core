/**
 * Tests for the getTopSpenders use case.
 *
 * Behaviors:
 *   1. Returns up to `limit` rows sorted by cost_usd desc
 *   2. Untagged row included when present
 *   3. Workspace isolation
 *   4. Window translation: same as getSpendSeries
 */

import type { UsageEventRow } from "@/lib/metering";
import { getTopSpendersUseCase } from "@/lib/metering";
import { describe, expect, test } from "bun:test";
import { InMemoryMeteringReadRepository } from "./fakes/in-memory-metering-read.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "99999999-8888-7777-6666-555555555555";

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

describe("getTopSpendersUseCase", () => {
    const to = new Date("2025-05-10T12:00:00Z");
    const from = new Date(to.getTime() - 24 * HOUR_MS);

    test("returns up to limit rows sorted by cost desc", async () => {
        const repo = new InMemoryMeteringReadRepository();

        repo.add(event({ tenantId: "tenant-A", costUsd: "0.10000000" }));
        repo.add(event({ tenantId: "tenant-B", costUsd: "0.50000000" }));
        repo.add(event({ tenantId: "tenant-C", costUsd: "0.30000000" }));
        repo.add(event({ tenantId: "tenant-D", costUsd: "0.05000000" }));

        const result = await getTopSpendersUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            limit: 2,
            repo,
        });

        expect(result.length).toBe(2);
        expect(result[0]?.tag).toBe("tenant-B");
        expect(result[0]?.costUsd).toBe("0.50000000");
        expect(result[1]?.tag).toBe("tenant-C");
        expect(result[1]?.costUsd).toBe("0.30000000");
    });

    test("propagates callCount per facet value", async () => {
        const repo = new InMemoryMeteringReadRepository();

        repo.add(event({ tenantId: "tenant-A", costUsd: "0.05000000" }));
        repo.add(event({ tenantId: "tenant-A", costUsd: "0.05000000" }));
        repo.add(event({ tenantId: "tenant-A", costUsd: "0.05000000" }));
        repo.add(event({ tenantId: "tenant-B", costUsd: "0.20000000" }));

        const result = await getTopSpendersUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            limit: 10,
            repo,
        });

        const a = result.find((r) => r.tag === "tenant-A");
        const b = result.find((r) => r.tag === "tenant-B");
        expect(a?.callCount).toBe(3);
        expect(b?.callCount).toBe(1);
    });

    test("callCount is zero-safe for untagged buckets with single event", async () => {
        const repo = new InMemoryMeteringReadRepository();

        repo.add(event({ tenantId: null, costUsd: "0.10000000" }));

        const result = await getTopSpendersUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            limit: 10,
            repo,
        });

        const untagged = result.find((r) => r.tag === "(untagged)");
        expect(untagged?.callCount).toBe(1);
    });

    test("untagged row included when null facet values exist", async () => {
        const repo = new InMemoryMeteringReadRepository();

        repo.add(event({ tenantId: null, costUsd: "0.20000000" }));
        repo.add(event({ tenantId: "tenant-A", costUsd: "0.10000000" }));

        const result = await getTopSpendersUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            limit: 10,
            repo,
        });

        const untagged = result.find((r) => r.tag === "(untagged)");
        expect(untagged).toBeDefined();
        expect(untagged?.costUsd).toBe("0.20000000");
    });

    test("workspace isolation: workspaceB events excluded", async () => {
        const repo = new InMemoryMeteringReadRepository();

        repo.add(event({ workspaceId: WORKSPACE_A, tenantId: "a", costUsd: "0.01000000" }));
        repo.add(event({ workspaceId: WORKSPACE_B, tenantId: "b", costUsd: "9.99000000" }));

        const result = await getTopSpendersUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            limit: 10,
            repo,
        });

        expect(result.length).toBe(1);
        expect(result[0]?.tag).toBe("a");
    });

    test("respects time range (24h excludes events older than 24h)", async () => {
        const repo = new InMemoryMeteringReadRepository();

        // 2 days back — outside 24h range
        repo.add(
            event({
                ts: new Date("2025-05-08T12:00:00Z"),
                tenantId: "old",
                costUsd: "9.99000000",
            }),
        );
        repo.add(
            event({
                ts: new Date("2025-05-10T11:00:00Z"),
                tenantId: "fresh",
                costUsd: "0.01000000",
            }),
        );

        const result = await getTopSpendersUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            limit: 10,
            repo,
        });

        expect(result.length).toBe(1);
        expect(result[0]?.tag).toBe("fresh");
    });

    test("empty workspace returns empty array", async () => {
        const repo = new InMemoryMeteringReadRepository();

        const result = await getTopSpendersUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            limit: 10,
            repo,
        });

        expect(result).toEqual([]);
    });

    test("aggregates cost per facet value across multiple events", async () => {
        const repo = new InMemoryMeteringReadRepository();

        repo.add(event({ tenantId: "tenant-A", costUsd: "0.05000000" }));
        repo.add(event({ tenantId: "tenant-A", costUsd: "0.05000000" }));
        repo.add(event({ tenantId: "tenant-B", costUsd: "0.07000000" }));

        const result = await getTopSpendersUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            limit: 10,
            repo,
        });

        expect(result.length).toBe(2);
        expect(result[0]?.tag).toBe("tenant-A");
        expect(result[0]?.costUsd).toBe("0.10000000");
        expect(result[1]?.tag).toBe("tenant-B");
    });

    test("provider filter restricts rows to a single provider", async () => {
        const repo = new InMemoryMeteringReadRepository();

        repo.add(event({ tenantId: "tenant-A", provider: "openai", costUsd: "0.10000000" }));
        repo.add(event({ tenantId: "tenant-B", provider: "anthropic", costUsd: "0.50000000" }));
        repo.add(event({ tenantId: "tenant-C", provider: "openai", costUsd: "0.30000000" }));

        const result = await getTopSpendersUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            limit: 10,
            repo,
            provider: ["openai"],
        });

        expect(result.map((r) => r.tag)).toEqual(["tenant-C", "tenant-A"]);
        expect(result[0]?.costUsd).toBe("0.30000000");
    });

    test("AND-combines tenant, agent, workflow, model, provider filters", async () => {
        const repo = new InMemoryMeteringReadRepository();

        // Matches all five filters.
        repo.add(
            event({
                tenantId: "tenant-X",
                agentId: "agent-X",
                workflowId: "wf-X",
                model: "gpt-4o",
                provider: "openai",
                costUsd: "0.20000000",
            }),
        );
        // Wrong tenant.
        repo.add(
            event({
                tenantId: "tenant-Y",
                agentId: "agent-X",
                workflowId: "wf-X",
                model: "gpt-4o",
                provider: "openai",
                costUsd: "9.00000000",
            }),
        );
        // Wrong agent.
        repo.add(
            event({
                tenantId: "tenant-X",
                agentId: "agent-Y",
                workflowId: "wf-X",
                model: "gpt-4o",
                provider: "openai",
                costUsd: "9.00000000",
            }),
        );
        // Wrong workflow.
        repo.add(
            event({
                tenantId: "tenant-X",
                agentId: "agent-X",
                workflowId: "wf-Y",
                model: "gpt-4o",
                provider: "openai",
                costUsd: "9.00000000",
            }),
        );
        // Wrong model.
        repo.add(
            event({
                tenantId: "tenant-X",
                agentId: "agent-X",
                workflowId: "wf-X",
                model: "gpt-3.5",
                provider: "openai",
                costUsd: "9.00000000",
            }),
        );
        // Wrong provider.
        repo.add(
            event({
                tenantId: "tenant-X",
                agentId: "agent-X",
                workflowId: "wf-X",
                model: "gpt-4o",
                provider: "anthropic",
                costUsd: "9.00000000",
            }),
        );

        const result = await getTopSpendersUseCase({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            from,
            to,
            limit: 10,
            repo,
            tenantId: ["tenant-X"],
            agentId: ["agent-X"],
            workflowId: ["wf-X"],
            model: ["gpt-4o"],
            provider: ["openai"],
        });

        expect(result).toHaveLength(1);
        expect(result[0]?.tag).toBe("tenant-X");
        expect(result[0]?.costUsd).toBe("0.20000000");
    });
});
