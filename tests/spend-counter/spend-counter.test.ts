/**
 * Unit tests for the Redis spend counter (slice #145).
 *
 * Behavior under test:
 *   1. Increment-then-read returns the running total for one scope.
 *   2. A tagged event fans out to every scope it rolls up to, and across all
 *      three budget periods.
 *   3. The counter TTL covers the remaining period window.
 *   4. A new period addresses a fresh counter (rollover).
 *   5. A missing counter reconciles from ClickHouse and matches a direct sum.
 *
 * Counters are born from a reconcile (`read` seeds them); a bare increment only
 * bumps an existing key. Tests therefore prime a window with a `read` before
 * recording, mirroring the production flow where the budget preflight read seeds
 * the counter before report-usage increments land.
 */

import type { UsageEventRow } from "@/lib/metering";
import { createSpendCounter, type RecordSpendEvent, type SpendCounter } from "@/lib/spend-counter";
import { beforeEach, describe, expect, test } from "bun:test";
import { InMemorySpendRepository } from "../spend/fakes/in-memory-spend.repository";
import { InMemorySpendCounterStore } from "./fakes/in-memory-spend-counter.store";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2026-06-10T12:00:00Z");
// Daily window containing NOW is [2026-06-10T00:00:00Z, 2026-06-11T00:00:00Z).
const DAILY_REMAINING_MS = 12 * 60 * 60 * 1000;

let store: InMemorySpendCounterStore;
let spend: InMemorySpendRepository;
let counter: SpendCounter;

beforeEach(() => {
    store = new InMemorySpendCounterStore();
    spend = new InMemorySpendRepository();
    counter = createSpendCounter({ store, spend });
});

const event = (overrides: Partial<RecordSpendEvent> = {}): RecordSpendEvent => ({
    workspaceId: WORKSPACE,
    tenantId: null,
    agentId: null,
    workflowId: null,
    costUsd: "1.00000000",
    ts: NOW,
    ...overrides,
});

const usageRow = (overrides: Partial<UsageEventRow> = {}): UsageEventRow => ({
    workspaceId: WORKSPACE,
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
    ts: NOW,
    status: "ok",
    ...overrides,
});

describe("SpendCounter.record + read", () => {
    test("increment-then-read returns the running total for one scope", async () => {
        // Prime the workspace/daily counter (born from a reconcile of 0).
        await counter.read({
            workspaceId: WORKSPACE,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            now: NOW,
        });

        await counter.record(
            [
                event({ costUsd: "0.00750000" }),
                event({ costUsd: "0.00750000" }),
                event({ costUsd: "0.00750000" }),
            ],
            NOW,
        );

        const total = await counter.read({
            workspaceId: WORKSPACE,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            now: NOW,
        });
        expect(total).toBeCloseTo(0.0225, 8);
    });

    test("a bare increment on an unseeded counter is a no-op (reconcile owns it)", async () => {
        // No prime read: the workspace/daily key does not exist yet.
        await counter.record([event({ costUsd: "5.00000000" })], NOW);

        // The increment was dropped; read reconciles from ClickHouse, which has
        // no rows, so spend is 0 — never a partial cached total.
        const total = await counter.read({
            workspaceId: WORKSPACE,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            now: NOW,
        });
        expect(total).toBe(0);
    });

    test("a tagged event bumps every scope it rolls up to", async () => {
        const scopes = [
            { scopeType: "workspace", scopeId: null },
            { scopeType: "tenant", scopeId: "tenant-a" },
            { scopeType: "agent", scopeId: "agent-x" },
            { scopeType: "workflow", scopeId: "wf-1" },
        ] as const;

        for (const scope of scopes) {
            await counter.read({ workspaceId: WORKSPACE, ...scope, period: "daily", now: NOW });
        }

        await counter.record(
            [
                event({
                    tenantId: "tenant-a",
                    agentId: "agent-x",
                    workflowId: "wf-1",
                    costUsd: "1.00000000",
                }),
            ],
            NOW,
        );

        for (const scope of scopes) {
            const total = await counter.read({
                workspaceId: WORKSPACE,
                ...scope,
                period: "daily",
                now: NOW,
            });
            expect(total).toBeCloseTo(1, 8);
        }
    });

    test("an event fans out across all three budget periods", async () => {
        for (const period of ["daily", "weekly", "monthly"] as const) {
            await counter.read({
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period,
                now: NOW,
            });
        }

        await counter.record([event({ costUsd: "2.00000000" })], NOW);

        for (const period of ["daily", "weekly", "monthly"] as const) {
            const total = await counter.read({
                workspaceId: WORKSPACE,
                scopeType: "workspace",
                scopeId: null,
                period,
                now: NOW,
            });
            expect(total).toBeCloseTo(2, 8);
        }
    });

    test("counter TTL covers the remaining period window", async () => {
        await counter.read({
            workspaceId: WORKSPACE,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            now: NOW,
        });
        await counter.record([event({ costUsd: "1.00000000" })], NOW);

        // Only the workspace/daily counter was seeded, so it is the lone keyed
        // entry; its TTL must reach the window's end.
        expect(store.ttls.size).toBe(1);
        expect([...store.ttls.values()][0]).toBe(DAILY_REMAINING_MS);
    });

    test("a new period window addresses a fresh counter", async () => {
        await counter.read({
            workspaceId: WORKSPACE,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            now: NOW,
        });
        await counter.record([event({ costUsd: "2.00000000" })], NOW);

        const sameWindow = await counter.read({
            workspaceId: WORKSPACE,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            now: NOW,
        });
        expect(sameWindow).toBeCloseTo(2, 8);

        // Next day: a different key, unseeded, reconciles from ClickHouse (empty).
        const nextDay = new Date("2026-06-11T12:00:00Z");
        const rolled = await counter.read({
            workspaceId: WORKSPACE,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            now: nextDay,
        });
        expect(rolled).toBe(0);
    });

    test("missing counter reconciles from ClickHouse and matches a direct sum", async () => {
        spend.add(usageRow({ ts: new Date("2026-06-10T08:00:00Z"), costUsd: "1.50000000" }));
        spend.add(usageRow({ ts: new Date("2026-06-10T16:00:00Z"), costUsd: "2.25000000" }));

        const query = {
            workspaceId: WORKSPACE,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            now: NOW,
        } as const;

        const reconciled = await counter.read(query);
        expect(reconciled).toBeCloseTo(3.75, 8);

        // Matches a direct ClickHouse window sum to the cent.
        const direct = await spend.getSpendForScope({
            workspaceId: WORKSPACE,
            scopeType: "workspace",
            scopeId: null,
            from: new Date("2026-06-10T00:00:00Z"),
            to: new Date("2026-06-11T00:00:00Z"),
            status: "ok",
        });
        expect(reconciled).toBeCloseTo(direct, 8);

        // The reconcile seeded the counter: a later read serves the cache even
        // after ClickHouse changes underneath it.
        spend.add(usageRow({ ts: new Date("2026-06-10T18:00:00Z"), costUsd: "9.99000000" }));
        const served = await counter.read(query);
        expect(served).toBeCloseTo(3.75, 8);
    });
});
