/**
 * CH-backed contract test for `countUsageEventsInWindow`, run against an
 * ephemeral database carved out of a live ClickHouse (env `CLICKHOUSE_URL`).
 *
 * Verifies the dashboard call-count path: the open-ended "since" count, the
 * half-open `[from, to)` count, the `status='ok'` filter, and AND-combined
 * `MeteringFilters`. Skips when no live server is configured.
 */

import { countUsageEventsInWindow } from "@/lib/dashboard/dashboard-stats";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
    clickhouseTestConfig,
    createTestClickHouse,
    truncateTables,
    type TestClickHouseHandle,
} from "../support/clickhouse-db";
import { CONTRACT_WORKSPACE, insertUsageEvent } from "../support/clickhouse-usage-events";

const hasClickHouse = clickhouseTestConfig() !== null;

const FROM = new Date("2026-06-10T00:00:00Z");
const TO = new Date("2026-06-11T00:00:00Z");

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

describe("countUsageEventsInWindow", () => {
    test.skipIf(!hasClickHouse)(
        "counts ok events at or after `from` when `to` is omitted",
        async () => {
            await insertUsageEvent(handle.ch, { ts: new Date("2026-06-09T23:00:00Z") });
            await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T01:00:00Z") });
            await insertUsageEvent(handle.ch, { ts: new Date("2026-06-12T00:00:00Z") });

            const count = await countUsageEventsInWindow(handle.ch, {
                workspaceId: CONTRACT_WORKSPACE,
                from: FROM,
            });

            expect(count).toBe(2);
        },
    );

    test.skipIf(!hasClickHouse)("count-between is half-open: row at `to` excluded", async () => {
        await insertUsageEvent(handle.ch, { ts: FROM });
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T12:00:00Z") });
        await insertUsageEvent(handle.ch, { ts: TO });

        const count = await countUsageEventsInWindow(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
        });

        expect(count).toBe(2);
    });

    test.skipIf(!hasClickHouse)("excludes blocked rows", async () => {
        await insertUsageEvent(handle.ch, { ts: new Date("2026-06-10T08:00:00Z"), status: "ok" });
        await insertUsageEvent(handle.ch, {
            ts: new Date("2026-06-10T09:00:00Z"),
            status: "blocked",
        });

        const count = await countUsageEventsInWindow(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
        });

        expect(count).toBe(1);
    });

    test.skipIf(!hasClickHouse)("MeteringFilters AND-combine across dimensions", async () => {
        await insertUsageEvent(handle.ch, {
            ts: new Date("2026-06-10T10:00:00Z"),
            tenantId: "t1",
            model: "gpt-4o",
        });
        await insertUsageEvent(handle.ch, {
            ts: new Date("2026-06-10T11:00:00Z"),
            tenantId: "t1",
            model: "gpt-3.5",
        });

        const count = await countUsageEventsInWindow(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
            filters: { tenantId: ["t1"], model: ["gpt-4o"] },
        });

        expect(count).toBe(1);
    });

    test.skipIf(!hasClickHouse)("empty workspace returns 0", async () => {
        const count = await countUsageEventsInWindow(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
        });
        expect(count).toBe(0);
    });
});
