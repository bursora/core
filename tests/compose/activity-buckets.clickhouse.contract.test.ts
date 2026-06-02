/**
 * CH-backed contract test for `fetchEventBuckets`, run against an ephemeral
 * database carved out of a live ClickHouse (env `CLICKHOUSE_URL`).
 *
 * Verifies the hourly call-count buckets behind the activity-feed sparkline:
 * epoch-floor bucketing to the hour, the `status='ok'` filter, the `since`
 * lower bound, and newest-first ordering. Skips when no live server is set.
 */

import { fetchEventBuckets } from "@/lib/compose/activity";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
    clickhouseTestConfig,
    createTestClickHouse,
    truncateTables,
    type TestClickHouseHandle,
} from "../support/clickhouse-db";
import { CONTRACT_WORKSPACE, insertUsageEvent } from "../support/clickhouse-usage-events";

const hasClickHouse = clickhouseTestConfig() !== null;

const SINCE = new Date("2026-06-10T00:00:00Z");

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

describe("fetchEventBuckets", () => {
    test.skipIf(!hasClickHouse)("counts ok events per hour, floored to the hour", async () => {
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T11:10:00Z") });
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T11:50:00Z") });
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T13:05:00Z") });

        const buckets = await fetchEventBuckets(handle.ch, CONTRACT_WORKSPACE, SINCE);

        const at11 = buckets.find((b) => b.at.toISOString() === "2026-06-10T11:00:00.000Z");
        const at13 = buckets.find((b) => b.at.toISOString() === "2026-06-10T13:00:00.000Z");
        expect(at11?.count).toBe(2);
        expect(at13?.count).toBe(1);
    });

    test.skipIf(!hasClickHouse)("excludes blocked rows", async () => {
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T11:10:00Z"), status: "ok" });
        await insertUsageEvent(handle.ch, {
            ts: new Date("2026-06-10T11:20:00Z"),
            status: "blocked",
        });

        const buckets = await fetchEventBuckets(handle.ch, CONTRACT_WORKSPACE, SINCE);

        expect(buckets).toHaveLength(1);
        expect(buckets[0]?.count).toBe(1);
    });

    test.skipIf(!hasClickHouse)("excludes rows before `since`", async () => {
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-09T23:00:00Z") });
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T01:00:00Z") });

        const buckets = await fetchEventBuckets(handle.ch, CONTRACT_WORKSPACE, SINCE);

        expect(buckets).toHaveLength(1);
        expect(buckets[0]?.at.toISOString()).toBe("2026-06-10T01:00:00.000Z");
    });

    test.skipIf(!hasClickHouse)("returns buckets newest-first", async () => {
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T10:00:00Z") });
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T15:00:00Z") });
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T12:00:00Z") });

        const buckets = await fetchEventBuckets(handle.ch, CONTRACT_WORKSPACE, SINCE);

        expect(buckets.map((b) => b.at.toISOString())).toEqual([
            "2026-06-10T15:00:00.000Z",
            "2026-06-10T12:00:00.000Z",
            "2026-06-10T10:00:00.000Z",
        ]);
    });

    test.skipIf(!hasClickHouse)("empty workspace returns []", async () => {
        const buckets = await fetchEventBuckets(handle.ch, CONTRACT_WORKSPACE, SINCE);
        expect(buckets).toEqual([]);
    });
});
