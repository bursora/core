/**
 * CH-backed contract test for `fetchEventBuckets`, run against an ephemeral
 * database carved out of a live ClickHouse (env `CLICKHOUSE_URL`).
 *
 * Verifies the daily call-count buckets behind the activity feed: grouping to
 * the viewer's local calendar day stamped at the latest event in each bucket
 * (`max(ts)`), the `status='ok'` filter, the `since` lower bound, and
 * newest-first ordering. Skips when no live server is set.
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
    test.skipIf(!hasClickHouse)(
        "counts ok events per day, stamped at the latest event in each bucket",
        async () => {
            await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T11:10:00Z") });
            await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T13:05:00Z") });
            await insertUsageEvent(handle.ch, { ts: new Date("2026-06-11T09:00:00Z") });

            const buckets = await fetchEventBuckets(handle.ch, CONTRACT_WORKSPACE, SINCE, "UTC");

            const day10 = buckets.find((b) => b.at.toISOString() === "2026-06-10T13:05:00.000Z");
            const day11 = buckets.find((b) => b.at.toISOString() === "2026-06-11T09:00:00.000Z");
            expect(day10?.count).toBe(2);
            expect(day11?.count).toBe(1);
        },
    );

    test.skipIf(!hasClickHouse)("groups by the calendar day of the supplied timezone", async () => {
        // 22:30Z is 00:30 the next day in Berlin (UTC+2 in June); 21:30Z is
        // still the same Berlin day. Same UTC day, two Berlin days.
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T21:30:00Z") });
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T22:30:00Z") });

        const utc = await fetchEventBuckets(handle.ch, CONTRACT_WORKSPACE, SINCE, "UTC");
        const berlin = await fetchEventBuckets(
            handle.ch,
            CONTRACT_WORKSPACE,
            SINCE,
            "Europe/Berlin",
        );

        expect(utc).toHaveLength(1);
        expect(utc[0]?.count).toBe(2);
        expect(berlin).toHaveLength(2);
    });

    test.skipIf(!hasClickHouse)("excludes blocked rows", async () => {
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T11:10:00Z"), status: "ok" });
        await insertUsageEvent(handle.ch, {
            ts: new Date("2026-06-10T11:20:00Z"),
            status: "blocked",
        });

        const buckets = await fetchEventBuckets(handle.ch, CONTRACT_WORKSPACE, SINCE, "UTC");

        expect(buckets).toHaveLength(1);
        expect(buckets[0]?.count).toBe(1);
    });

    test.skipIf(!hasClickHouse)("excludes rows before `since`", async () => {
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-09T23:00:00Z") });
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T01:00:00Z") });

        const buckets = await fetchEventBuckets(handle.ch, CONTRACT_WORKSPACE, SINCE, "UTC");

        expect(buckets).toHaveLength(1);
        expect(buckets[0]?.at.toISOString()).toBe("2026-06-10T01:00:00.000Z");
    });

    test.skipIf(!hasClickHouse)("returns buckets newest-day-first", async () => {
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T10:00:00Z") });
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-12T15:00:00Z") });
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-11T12:00:00Z") });

        const buckets = await fetchEventBuckets(handle.ch, CONTRACT_WORKSPACE, SINCE, "UTC");

        expect(buckets.map((b) => b.at.toISOString())).toEqual([
            "2026-06-12T15:00:00.000Z",
            "2026-06-11T12:00:00.000Z",
            "2026-06-10T10:00:00.000Z",
        ]);
    });

    test.skipIf(!hasClickHouse)("empty workspace returns []", async () => {
        const buckets = await fetchEventBuckets(handle.ch, CONTRACT_WORKSPACE, SINCE, "UTC");
        expect(buckets).toEqual([]);
    });
});
