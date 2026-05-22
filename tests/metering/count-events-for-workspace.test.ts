/**
 * Tests for `countEventsForWorkspaceUseCase`. The dashboard empty state needs a
 * cheap "did this workspace ever record an event" check; the use case wraps a
 * single repository call so the page stays in the application layer.
 *
 * Behaviors:
 *   1. Returns 0 for a workspace with no events.
 *   2. Returns the count for the matching workspace only — never leaks across.
 *   3. Honors the optional `since` window so the page can ask about
 *      "recent activity" without scanning the full partition.
 */

import type { UsageEventRow } from "@/lib/metering";
import { countEventsForWorkspaceUseCase } from "@/lib/metering";
import { describe, expect, test } from "bun:test";
import { InMemoryMeteringReadRepository } from "./fakes/in-memory-metering-read.repository";

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
    costUsd: "0.01000000",
    requestId: null,
    ts: new Date("2025-05-10T12:30:00Z"),
    ...overrides,
});

describe("countEventsForWorkspaceUseCase", () => {
    test("returns 0 for a workspace with no events", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const count = await countEventsForWorkspaceUseCase({
            workspaceId: WORKSPACE_A,
            repo,
        });
        expect(count).toBe(0);
    });

    test("counts only events for the requested workspace", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event());
        repo.add(event({ ts: new Date("2025-05-10T13:00:00Z") }));
        repo.add(event({ workspaceId: WORKSPACE_B }));

        const count = await countEventsForWorkspaceUseCase({
            workspaceId: WORKSPACE_A,
            repo,
        });
        expect(count).toBe(2);
    });

    test("filters by `since` when provided", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ ts: new Date("2025-05-01T00:00:00Z") }));
        repo.add(event({ ts: new Date("2025-05-10T12:00:00Z") }));
        repo.add(event({ ts: new Date("2025-05-10T13:00:00Z") }));

        const count = await countEventsForWorkspaceUseCase({
            workspaceId: WORKSPACE_A,
            repo,
            since: new Date("2025-05-10T00:00:00Z"),
        });
        expect(count).toBe(2);
    });

    test("filters by `provider` when provided", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ provider: "openai" }));
        repo.add(event({ provider: "anthropic" }));
        repo.add(event({ provider: "anthropic" }));

        const count = await countEventsForWorkspaceUseCase({
            workspaceId: WORKSPACE_A,
            repo,
            provider: ["anthropic"],
        });
        expect(count).toBe(2);
    });

    test("OR-combines multiple values within a dimension", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ provider: "openai" }));
        repo.add(event({ provider: "anthropic" }));
        repo.add(event({ provider: "deepseek" }));

        const count = await countEventsForWorkspaceUseCase({
            workspaceId: WORKSPACE_A,
            repo,
            provider: ["openai", "anthropic"],
        });
        expect(count).toBe(2);
    });

    test("AND-combines tenant, agent, workflow, model filters", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(
            event({
                tenantId: "t1",
                agentId: "a1",
                workflowId: "w1",
                model: "gpt-4o",
            }),
        );
        repo.add(
            event({
                tenantId: "t1",
                agentId: "a2",
                workflowId: "w1",
                model: "gpt-4o",
            }),
        );
        repo.add(
            event({
                tenantId: "t1",
                agentId: "a1",
                workflowId: "w1",
                model: "gpt-3.5",
            }),
        );

        const count = await countEventsForWorkspaceUseCase({
            workspaceId: WORKSPACE_A,
            repo,
            tenantId: ["t1"],
            agentId: ["a1"],
            workflowId: ["w1"],
            model: ["gpt-4o"],
        });
        expect(count).toBe(1);
    });
});
