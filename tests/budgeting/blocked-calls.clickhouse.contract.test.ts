/**
 * CH-backed contract test for the blocked-call rollups, run against an
 * ephemeral database carved out of a live ClickHouse (env `CLICKHOUSE_URL`).
 *
 * Verifies `getBlockedCallsLastDay` (rolling 24h/1h split, `status='blocked'`
 * only) and `countBlockedSinceTrip` (blocked count since a timestamp, workspace
 * isolation). Skips when no live server is configured.
 */

import { countBlockedSinceTrip, getBlockedCallsLastDay } from "@/lib/budgeting/blocked-calls";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
    clickhouseTestConfig,
    createTestClickHouse,
    truncateTables,
    type TestClickHouseHandle,
} from "../support/clickhouse-db";
import { CONTRACT_WORKSPACE, insertUsageEvent } from "../support/clickhouse-usage-events";

const hasClickHouse = clickhouseTestConfig() !== null;

const WORKSPACE_B = "99999999-8888-7777-6666-555555555555";
const NOW = new Date("2026-06-10T12:00:00Z");

let handle: TestClickHouseHandle;

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

describe("getBlockedCallsLastDay", () => {
    test.skipIf(!hasClickHouse)("splits the rolling 24h and 1h blocked counts", async () => {
        // within the last hour
        await insertUsageEvent(handle.ch, {
            status: "blocked",
            ts: new Date("2026-06-10T11:30:00Z"),
        });
        // within 24h, beyond 1h
        await insertUsageEvent(handle.ch, {
            status: "blocked",
            ts: new Date("2026-06-10T06:00:00Z"),
        });
        // older than 24h
        await insertUsageEvent(handle.ch, {
            status: "blocked",
            ts: new Date("2026-06-09T06:00:00Z"),
        });
        // ok rows never count
        await insertUsageEvent(handle.ch, { status: "ok", ts: new Date("2026-06-10T11:45:00Z") });

        const result = await getBlockedCallsLastDay({
            ch: handle.ch,
            workspaceId: CONTRACT_WORKSPACE,
            now: NOW,
        });

        expect(result.lastDay).toBe(2);
        expect(result.lastHour).toBe(1);
    });

    test.skipIf(!hasClickHouse)("empty workspace returns zeros", async () => {
        const result = await getBlockedCallsLastDay({
            ch: handle.ch,
            workspaceId: CONTRACT_WORKSPACE,
            now: NOW,
        });
        expect(result).toEqual({ lastDay: 0, lastHour: 0 });
    });
});

describe("countBlockedSinceTrip", () => {
    test.skipIf(!hasClickHouse)("counts blocked rows at or after `since`", async () => {
        await insertUsageEvent(handle.ch, {
            status: "blocked",
            ts: new Date("2026-06-10T10:30:00Z"),
        });
        await insertUsageEvent(handle.ch, {
            status: "blocked",
            ts: new Date("2026-06-10T11:30:00Z"),
        });
        // before the trip
        await insertUsageEvent(handle.ch, {
            status: "blocked",
            ts: new Date("2026-06-10T09:00:00Z"),
        });
        // ok rows never count
        await insertUsageEvent(handle.ch, { status: "ok", ts: new Date("2026-06-10T11:00:00Z") });

        const count = await countBlockedSinceTrip({
            ch: handle.ch,
            workspaceId: CONTRACT_WORKSPACE,
            since: new Date("2026-06-10T10:00:00Z"),
        });

        expect(count).toBe(2);
    });

    test.skipIf(!hasClickHouse)("other workspaces never leak", async () => {
        await insertUsageEvent(handle.ch, {
            status: "blocked",
            ts: new Date("2026-06-10T11:00:00Z"),
        });
        await insertUsageEvent(handle.ch, {
            workspaceId: WORKSPACE_B,
            status: "blocked",
            ts: new Date("2026-06-10T11:00:00Z"),
        });

        const count = await countBlockedSinceTrip({
            ch: handle.ch,
            workspaceId: CONTRACT_WORKSPACE,
            since: new Date("2026-06-10T10:00:00Z"),
        });

        expect(count).toBe(1);
    });
});
