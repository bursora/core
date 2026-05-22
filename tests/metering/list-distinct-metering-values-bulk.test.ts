/**
 * Tests for `listDistinctMeteringValuesBulkUseCase` — one round-trip variant
 * of the per-scope distinct-values query. Powers dashboard pages that need
 * filter pills for provider, tenant, agent, workflow, model at once.
 */

import type { UsageEventRow } from "@/lib/metering";
import { listDistinctMeteringValuesBulkUseCase } from "@/lib/metering";
import { describe, expect, test } from "bun:test";
import { InMemoryMeteringReadRepository } from "./fakes/in-memory-metering-read.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "99999999-8888-7777-6666-555555555555";
const NOW = new Date("2025-05-10T12:00:00Z");

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
    ts: NOW,
    ...overrides,
});

describe("listDistinctMeteringValuesBulkUseCase", () => {
    test("returns a map keyed by scope, each value sorted by count desc", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ provider: "openai", tenantId: "t-a" }));
        repo.add(event({ provider: "openai", tenantId: "t-a" }));
        repo.add(event({ provider: "anthropic", tenantId: "t-b" }));

        const out = await listDistinctMeteringValuesBulkUseCase({
            workspaceId: WORKSPACE_A,
            scopes: ["provider", "tenant"],
            now: NOW,
            repo,
        });

        expect(out.provider).toEqual([
            { value: "openai", count: 2 },
            { value: "anthropic", count: 1 },
        ]);
        expect(out.tenant).toEqual([
            { value: "t-a", count: 2 },
            { value: "t-b", count: 1 },
        ]);
    });

    test("returns empty arrays for scopes with no rows", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ provider: "openai" }));

        const out = await listDistinctMeteringValuesBulkUseCase({
            workspaceId: WORKSPACE_A,
            scopes: ["provider", "workflow"],
            now: NOW,
            repo,
        });

        expect(out.provider).toEqual([{ value: "openai", count: 1 }]);
        expect(out.workflow).toEqual([]);
    });

    test("scopes the result to the requested workspace", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ workspaceId: WORKSPACE_A, provider: "openai" }));
        repo.add(event({ workspaceId: WORKSPACE_B, provider: "deepseek" }));

        const out = await listDistinctMeteringValuesBulkUseCase({
            workspaceId: WORKSPACE_A,
            scopes: ["provider"],
            now: NOW,
            repo,
        });

        expect(out.provider).toEqual([{ value: "openai", count: 1 }]);
    });

    test("returns an empty object when scopes is empty", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ provider: "openai" }));

        const out = await listDistinctMeteringValuesBulkUseCase({
            workspaceId: WORKSPACE_A,
            scopes: [],
            now: NOW,
            repo,
        });

        expect(out).toEqual({});
    });
});
