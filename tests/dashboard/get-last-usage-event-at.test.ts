/**
 * `getLastUsageEventAt` — read-side helper for the dashboard SDK heartbeat.
 *
 * Returns the timestamp of the most recent usage event for the workspace,
 * or `null` when the workspace has never recorded one. The status strip
 * uses this with `heartbeatTone` to color the SDK dot.
 */

import type { UsageEventRow } from "@/lib/metering";
import { getLastUsageEventAtUseCase } from "@/lib/metering";
import { InMemoryMeteringReadRepository } from "@/tests/metering/fakes/in-memory-metering-read.repository";
import { describe, expect, test } from "bun:test";

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
    ts: new Date("2026-05-16T11:00:00Z"),
    ...overrides,
});

describe("getLastUsageEventAtUseCase", () => {
    test("returns null when the workspace has no events", async () => {
        const repo = new InMemoryMeteringReadRepository();
        const at = await getLastUsageEventAtUseCase({ workspaceId: WORKSPACE_A, repo });
        expect(at).toBeNull();
    });

    test("returns the latest ts for the workspace", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ ts: new Date("2026-05-15T10:00:00Z") }));
        repo.add(event({ ts: new Date("2026-05-16T11:30:00Z") }));
        repo.add(event({ ts: new Date("2026-05-16T11:00:00Z") }));

        const at = await getLastUsageEventAtUseCase({ workspaceId: WORKSPACE_A, repo });
        expect(at).toEqual(new Date("2026-05-16T11:30:00Z"));
    });

    test("ignores events from other workspaces", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(event({ workspaceId: WORKSPACE_B, ts: new Date("2026-05-16T13:00:00Z") }));
        repo.add(event({ workspaceId: WORKSPACE_A, ts: new Date("2026-05-16T11:00:00Z") }));

        const at = await getLastUsageEventAtUseCase({ workspaceId: WORKSPACE_A, repo });
        expect(at).toEqual(new Date("2026-05-16T11:00:00Z"));
    });
});
