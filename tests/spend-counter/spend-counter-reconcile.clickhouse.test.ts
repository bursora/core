/**
 * Reconcile-on-miss against a live ClickHouse: a missing counter must serve a
 * value that matches a direct `SUM(cost_usd)` over the same window, to the cent.
 *
 * Runs the real `clickHouseSpendRepository` behind the counter with an in-memory
 * store (so every read is a miss → reconcile). Skips cleanly when no live server
 * is configured; CI provides one.
 */

import { createSpendCounter } from "@/lib/spend-counter";
import { clickHouseSpendRepository } from "@/lib/spend/clickhouse-spend.repository";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
    clickhouseTestConfig,
    createTestClickHouse,
    truncateTables,
    type TestClickHouseHandle,
} from "../support/clickhouse-db";
import { InMemorySpendCounterStore } from "./fakes/in-memory-spend-counter.store";

const hasClickHouse = clickhouseTestConfig() !== null;

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2026-06-10T12:00:00Z");
const WINDOW_START = new Date("2026-06-10T00:00:00Z");
const WINDOW_END = new Date("2026-06-11T00:00:00Z");

let handle: TestClickHouseHandle;

const toChDateTime = (d: Date): string => d.toISOString().replace("T", " ").replace("Z", "");

const insertEvent = async (overrides: {
    tenantId?: string;
    costUsd?: string;
    status?: "ok" | "blocked";
    ts?: Date;
}): Promise<void> => {
    await handle.ch.insert({
        table: "usage_events",
        values: [
            {
                id: randomUUID(),
                workspace_id: WORKSPACE,
                tenant_id: overrides.tenantId ?? "",
                agent_id: "",
                workflow_id: "",
                provider: "openai",
                model: "gpt-4o",
                prompt_tokens: 100,
                completion_tokens: 50,
                cache_tokens: 0,
                cost_usd: overrides.costUsd ?? "0.00000000",
                status: overrides.status ?? "ok",
                ts: toChDateTime(overrides.ts ?? NOW),
            },
        ],
    });
};

beforeAll(async () => {
    if (!hasClickHouse) return;
    handle = await createTestClickHouse();
});

afterAll(async () => {
    await handle?.close();
});

beforeEach(async () => {
    if (!hasClickHouse) return;
    await truncateTables(handle.native, handle.database);
});

describe("SpendCounter reconcile against ClickHouse", () => {
    test.skipIf(!hasClickHouse)("workspace miss matches a direct sum to the cent", async () => {
        await insertEvent({ ts: new Date("2026-06-10T08:00:00Z"), costUsd: "1.50000000" });
        await insertEvent({ ts: new Date("2026-06-10T16:00:00Z"), costUsd: "2.25000000" });
        // Out-of-window and blocked rows must not count.
        await insertEvent({ ts: new Date("2026-06-09T23:00:00Z"), costUsd: "99.00000000" });
        await insertEvent({
            ts: new Date("2026-06-10T10:00:00Z"),
            costUsd: "5.00000000",
            status: "blocked",
        });

        const repo = clickHouseSpendRepository(handle.ch);
        const counter = createSpendCounter({ store: new InMemorySpendCounterStore(), spend: repo });

        const reconciled = await counter.read({
            workspaceId: WORKSPACE,
            scopeType: "workspace",
            scopeId: null,
            period: "daily",
            now: NOW,
        });

        const direct = await repo.getSpendForScope({
            workspaceId: WORKSPACE,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
        });

        expect(reconciled).toBeCloseTo(3.75, 2);
        expect(reconciled).toBeCloseTo(direct, 8);
    });

    test.skipIf(!hasClickHouse)("tenant-scoped miss matches a direct tenant sum", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T08:00:00Z"),
            tenantId: "tenant-a",
            costUsd: "0.30000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T09:00:00Z"),
            tenantId: "tenant-a",
            costUsd: "0.70000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T09:30:00Z"),
            tenantId: "tenant-b",
            costUsd: "4.00000000",
        });

        const repo = clickHouseSpendRepository(handle.ch);
        const counter = createSpendCounter({ store: new InMemorySpendCounterStore(), spend: repo });

        const reconciled = await counter.read({
            workspaceId: WORKSPACE,
            scopeType: "tenant",
            scopeId: "tenant-a",
            period: "daily",
            now: NOW,
        });

        const direct = await repo.getSpendForScope({
            workspaceId: WORKSPACE,
            scopeType: "tenant",
            scopeId: "tenant-a",
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
        });

        expect(reconciled).toBeCloseTo(1, 2);
        expect(reconciled).toBeCloseTo(direct, 8);
    });
});
