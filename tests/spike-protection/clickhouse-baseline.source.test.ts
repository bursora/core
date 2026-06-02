/**
 * Integration test for the REAL `clickHouseBaselineSource`, run against an
 * ephemeral ClickHouse database with the production `usage_events` DDL applied.
 *
 * Asserts the CH adapter produces the same dense 7-day minute series the
 * Postgres adapter did: length 10_080, one slot per minute, only `status='ok'`
 * rows inside the half-open [start, end) window for the target workspace.
 *
 * Guarded on `CLICKHOUSE_URL`; skips cleanly without a live server (CI / local
 * boot runs it against real CH).
 */

import { clickHouseBaselineSource } from "@/lib/spike-protection/clickhouse-baseline.source";
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
const WS_OTHER = "00000000-0000-4000-8000-0000000000ff";

const MINUTE_MS = 60_000;
const END = Date.parse("2026-06-08T00:00:00.000Z");
const START = END - 7 * 24 * 60 * 60 * 1000; // 2026-06-01T00:00:00.000Z
const MINUTES_IN_WINDOW = 7 * 24 * 60;

interface EventRow {
    id: string;
    workspace_id: string;
    status: string;
    cost_usd: string;
    ts: number;
}

let handle: TestClickHouseHandle;

const source = () => clickHouseBaselineSource(handle.ch);

const insert = (rows: readonly Partial<EventRow>[]): Promise<void> =>
    handle.ch.insert<EventRow>({
        table: "usage_events",
        values: rows.map((r) => ({
            id: randomUUID(),
            workspace_id: WS,
            status: "ok",
            cost_usd: "0.00000000",
            ts: START,
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
    "counts ok rows per minute into a dense 7-day series, matching the PG shape",
    async () => {
        await insert([
            // idx 0: three ok rows in the first minute
            { ts: START },
            { ts: START },
            { ts: START },
            // idx 1: two ok rows, the second mid-minute to exercise minute flooring
            { ts: START + MINUTE_MS },
            { ts: START + MINUTE_MS + 30_000 },
            // idx 10079: last minute inside the window
            { ts: END - MINUTE_MS },
            // excluded: blocked row (pre-decision, must not anchor the baseline)
            { ts: START, status: "blocked" },
            // excluded: exactly at end (half-open upper bound)
            { ts: END },
            // excluded: one minute before the window opens
            { ts: START - MINUTE_MS },
            // excluded: a different workspace
            { ts: START, workspace_id: WS_OTHER },
        ]);

        const series = await source().fetch7DayMinuteSeries({ workspaceId: WS, endMs: END });

        expect(series).toHaveLength(MINUTES_IN_WINDOW);
        expect(series[0]).toBe(3);
        expect(series[1]).toBe(2);
        expect(series[MINUTES_IN_WINDOW - 1]).toBe(1);
        // Only the 3 + 2 + 1 in-window ok rows count; everything else is filtered.
        expect(series.reduce((sum, n) => sum + n, 0)).toBe(6);
    },
);

test.skipIf(!hasClickHouse)("empty workspace yields an all-zero dense series", async () => {
    const series = await source().fetch7DayMinuteSeries({ workspaceId: WS, endMs: END });
    expect(series).toHaveLength(MINUTES_IN_WINDOW);
    expect(series.every((n) => n === 0)).toBe(true);
});
