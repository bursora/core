/**
 * ClickHouseUsageEventRepository.
 *
 * Two layers:
 *   - Unit: a fake `ClickHouse` records the insert so the column mapping
 *     (snake_case names, null facet → '', cost_usd string, status default, ts
 *     format) and the returned count are asserted without a live server.
 *   - Integration: guarded on CLICKHOUSE_URL, the rows round-trip through a
 *     real ephemeral database via the shared harness. Confirms the sink writes
 *     every row given (no dedup at this layer — that's the use-case's job).
 */

import type { ClickHouse, ClickHouseInsert } from "@/lib/clickhouse/client";
import type { UsageEventRow } from "@/lib/metering";
import { ClickHouseUsageEventRepository } from "@/lib/metering/clickhouse-usage-event.repository";
import {
    clickhouseTestConfig,
    createTestClickHouse,
    truncateTables,
    type TestClickHouseHandle,
} from "@/tests/support/clickhouse-db";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

// The table carries `TTL ts + 90 DAY`, so a stale ts is evicted on insert and
// the read-back races an empty table. Integration rows use a ts inside the
// window; the unit factory keeps its fixed past ts for the format assertion.
const RECENT_TS = new Date("2026-05-10T12:00:00.123Z");

const row = (overrides: Partial<UsageEventRow> = {}): UsageEventRow => ({
    workspaceId: WORKSPACE,
    tenantId: null,
    agentId: null,
    workflowId: null,
    provider: "openai",
    model: "gpt-4o",
    promptTokens: 1000,
    completionTokens: 500,
    cacheTokens: 0,
    latencyMs: null,
    costUsd: "0.00750000",
    requestId: null,
    ts: new Date("2025-05-10T12:00:00.123Z"),
    ...overrides,
});

interface FakeClickHouse {
    ch: ClickHouse;
    inserts: ClickHouseInsert<Record<string, unknown>>[];
}

function createFakeClickHouse(): FakeClickHouse {
    const inserts: ClickHouseInsert<Record<string, unknown>>[] = [];
    const ch: ClickHouse = {
        async query() {
            return [];
        },
        async insert(params) {
            inserts.push(params as ClickHouseInsert<Record<string, unknown>>);
        },
        async ping() {},
    };
    return { ch, inserts };
}

describe("ClickHouseUsageEventRepository (unit)", () => {
    test("maps the domain row onto the DDL columns", async () => {
        const { ch, inserts } = createFakeClickHouse();

        const count = await new ClickHouseUsageEventRepository(ch).insertBatch([
            row({
                tenantId: "tenant-a",
                agentId: null,
                requestId: "req-1",
                latencyMs: 42,
            }),
        ]);

        expect(count).toBe(1);
        expect(inserts).toHaveLength(1);
        expect(inserts[0]?.table).toBe("usage_events");

        const written = inserts[0]?.values[0];
        expect(written).toMatchObject({
            workspace_id: WORKSPACE,
            tenant_id: "tenant-a",
            // Absent facet tags collapse to the empty string the table expects.
            agent_id: "",
            workflow_id: "",
            provider: "openai",
            model: "gpt-4o",
            prompt_tokens: 1000,
            completion_tokens: 500,
            cache_tokens: 0,
            latency_ms: 42,
            // Decimal stays a string so precision survives the wire.
            cost_usd: "0.00750000",
            request_id: "req-1",
            status: "ok",
            decided_by_budget_id: null,
            block_reason: null,
            // DateTime64(3): 'YYYY-MM-DD HH:MM:SS.mmm' UTC, no ISO T/Z.
            ts: "2025-05-10 12:00:00.123",
        });
        expect(typeof written?.id).toBe("string");
    });

    test("carries blocked-row status fields through to the columns", async () => {
        const { ch, inserts } = createFakeClickHouse();

        await new ClickHouseUsageEventRepository(ch).insertBatch([
            row({
                status: "blocked",
                decidedByBudgetId: "budget-9",
                blockReason: "workspace:*:over:1.8/2",
                costUsd: "0",
            }),
        ]);

        expect(inserts[0]?.values[0]).toMatchObject({
            status: "blocked",
            decided_by_budget_id: "budget-9",
            block_reason: "workspace:*:over:1.8/2",
            cost_usd: "0",
        });
    });

    test("empty batch returns 0 without an insert", async () => {
        const { ch, inserts } = createFakeClickHouse();

        const count = await new ClickHouseUsageEventRepository(ch).insertBatch([]);

        expect(count).toBe(0);
        expect(inserts).toHaveLength(0);
    });
});

const hasClickHouse = clickhouseTestConfig() !== null;

describe("ClickHouseUsageEventRepository (integration)", () => {
    let handle: TestClickHouseHandle;

    beforeAll(async () => {
        if (!hasClickHouse) return;
        handle = await createTestClickHouse();
    });

    afterAll(async () => {
        await handle?.close();
    });

    test.skipIf(!hasClickHouse)("writes a batch that reads back with mapped columns", async () => {
        await truncateTables(handle.native, handle.database);
        const repo = new ClickHouseUsageEventRepository(handle.ch);

        const written = await repo.insertBatch([
            row({ requestId: "req-1", tenantId: "tenant-a", latencyMs: 12, ts: RECENT_TS }),
            row({ requestId: "req-2", tenantId: null, ts: RECENT_TS }),
        ]);
        expect(written).toBe(2);

        const rows = await handle.ch.query<{
            request_id: string | null;
            tenant_id: string;
            cost_usd: string;
            latency_ms: number | null;
            status: string;
        }>({
            // toString() keeps the Decimal(22,8) a string over the wire (a raw
            // read returns it as a lossy JSON number); CH renders it canonical,
            // dropping trailing zeros, so the repos pad on the way out.
            query: "SELECT request_id, tenant_id, toString(cost_usd) AS cost_usd, latency_ms, status FROM usage_events ORDER BY request_id",
        });

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            request_id: "req-1",
            tenant_id: "tenant-a",
            cost_usd: "0.0075",
            latency_ms: 12,
            status: "ok",
        });
        // Null facet tag persisted as the empty-string default.
        expect(rows[1]?.tenant_id).toBe("");
        expect(rows[1]?.latency_ms).toBeNull();
    });

    test.skipIf(!hasClickHouse)(
        "is a plain sink: the same request_id written twice lands twice",
        async () => {
            await truncateTables(handle.native, handle.database);
            const repo = new ClickHouseUsageEventRepository(handle.ch);

            await repo.insertBatch([row({ requestId: "dup", ts: RECENT_TS })]);
            await repo.insertBatch([row({ requestId: "dup", ts: RECENT_TS })]);

            const counted = await handle.ch.query<{ n: string }>({
                query: "SELECT count() AS n FROM usage_events",
            });
            // Idempotency is enforced upstream by the dedup guard, never here.
            expect(Number(counted[0]?.n)).toBe(2);
        },
    );
});
