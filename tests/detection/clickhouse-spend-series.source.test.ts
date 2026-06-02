/**
 * Integration test for the REAL `clickHouseSpendSeriesSource`, run against an
 * ephemeral ClickHouse database with the production `usage_events` DDL applied.
 *
 * Asserts parity with the Postgres adapter's shape: cost summed per
 * (workspace, tenant, agent) into 5-minute buckets since the cutoff, only
 * `status='ok'` rows, empty buckets omitted, absent tenant/agent surfaced as
 * null, scopes ordered (workspace, tenant, agent) with absent tags last and
 * points ordered by ts ascending.
 *
 * Guarded on `CLICKHOUSE_URL`; skips cleanly without a live server.
 */

import { clickHouseSpendSeriesSource } from "@/lib/detection/clickhouse-spend-series.source";
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
    clickhouseTestConfig,
    createTestClickHouse,
    truncateTables,
    type TestClickHouseHandle,
} from "../support/clickhouse-db";

const hasClickHouse = clickhouseTestConfig() !== null;

const WS = "00000000-0000-4000-8000-000000000001";
const WS2 = "00000000-0000-4000-8000-000000000002";

const SINCE = new Date("2026-06-01T00:00:00.000Z");
const B0 = Date.parse("2026-06-01T00:00:00.000Z"); // 5-min bucket boundary
const B5 = Date.parse("2026-06-01T00:05:00.000Z"); // next 5-min boundary

interface EventRow {
    id: string;
    workspace_id: string;
    // Omitted when absent so ClickHouse applies the column DEFAULT '' (the
    // "tag not set" sentinel the source maps back to null).
    tenant_id?: string;
    agent_id?: string;
    status: string;
    cost_usd: string;
    ts: number;
}

let handle: TestClickHouseHandle;

const source = () => clickHouseSpendSeriesSource(handle.ch);

const insert = (rows: readonly Partial<EventRow>[]): Promise<void> =>
    handle.ch.insert<EventRow>({
        table: "usage_events",
        values: rows.map((r) => ({
            id: randomUUID(),
            workspace_id: WS,
            status: "ok",
            cost_usd: "0.00000000",
            ts: B0,
            ...r,
        })),
    });

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

test.skipIf(!hasClickHouse)(
    "buckets cost per (workspace, tenant, agent) into 5-min windows, matching the PG shape",
    async () => {
        await insert([
            // (WS, t1, a1): two events in bucket B0 (1.0 + 2.0 = 3.0), one in B5 (0.5).
            // The second B0 event is mid-bucket to exercise 5-minute flooring.
            { tenant_id: "t1", agent_id: "a1", cost_usd: "1.00000000", ts: B0 },
            { tenant_id: "t1", agent_id: "a1", cost_usd: "2.00000000", ts: B0 + 120_000 },
            { tenant_id: "t1", agent_id: "a1", cost_usd: "0.50000000", ts: B5 },
            // (WS, t1, absent agent): 4.0 at B0
            { tenant_id: "t1", cost_usd: "4.00000000", ts: B0 },
            // (WS, absent tenant, absent agent): 7.0 at B0
            { cost_usd: "7.00000000", ts: B0 },
            // excluded: blocked row
            {
                tenant_id: "t1",
                agent_id: "a1",
                status: "blocked",
                cost_usd: "99.00000000",
                ts: B0,
            },
            // excluded: before the cutoff
            { tenant_id: "t1", agent_id: "a1", cost_usd: "5.00000000", ts: B0 - 3_600_000 },
            // second workspace, surfaced as its own scope after WS (id ordering)
            { workspace_id: WS2, tenant_id: "t2", agent_id: "a2", cost_usd: "1.00000000", ts: B0 },
        ]);

        const result = await source().listScopedSeries(SINCE);

        expect(result).toEqual([
            {
                scope: { workspaceId: WS, tenantId: "t1", agentId: "a1" },
                points: [
                    { ts: new Date(B0), costUsd: 3 },
                    { ts: new Date(B5), costUsd: 0.5 },
                ],
            },
            {
                scope: { workspaceId: WS, tenantId: "t1", agentId: null },
                points: [{ ts: new Date(B0), costUsd: 4 }],
            },
            {
                scope: { workspaceId: WS, tenantId: null, agentId: null },
                points: [{ ts: new Date(B0), costUsd: 7 }],
            },
            {
                scope: { workspaceId: WS2, tenantId: "t2", agentId: "a2" },
                points: [{ ts: new Date(B0), costUsd: 1 }],
            },
        ]);
    },
);

test.skipIf(!hasClickHouse)("returns nothing when no ok rows exist since the cutoff", async () => {
    await insert([
        { tenant_id: "t1", agent_id: "a1", status: "blocked", cost_usd: "9.00000000", ts: B0 },
    ]);
    const result = await source().listScopedSeries(SINCE);
    expect(result).toEqual([]);
});
