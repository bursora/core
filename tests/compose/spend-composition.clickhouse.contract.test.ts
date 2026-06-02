/**
 * CH-backed contract test for `fetchSpendCompositionRows`, run against an
 * ephemeral database carved out of a live ClickHouse (env `CLICKHOUSE_URL`).
 *
 * Verifies the per-(tenant, model) cost rollup that feeds the customer
 * composition panel: SUM precision to the cent, tenant/model grouping, the
 * `status='ok'` filter, the half-open window, untagged-tenant exclusion, and
 * workspace isolation. Skips cleanly when no live server is configured.
 */

import { fetchSpendCompositionRows } from "@/lib/compose/spend-composition";
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

describe("fetchSpendCompositionRows", () => {
    test.skipIf(!hasClickHouse)("groups by (tenant, model) and sums cost to the cent", async () => {
        await insertUsageEvent(handle.ch, {
            tenantId: "t1",
            model: "gpt-4o",
            costUsd: "0.10000000",
            ts: new Date("2026-06-10T08:00:00Z"),
        });
        await insertUsageEvent(handle.ch, {
            tenantId: "t1",
            model: "gpt-4o",
            costUsd: "0.05000000",
            ts: new Date("2026-06-10T09:00:00Z"),
        });
        await insertUsageEvent(handle.ch, {
            tenantId: "t1",
            model: "gpt-3.5",
            costUsd: "1.00000000",
            ts: new Date("2026-06-10T10:00:00Z"),
        });

        const rows = await fetchSpendCompositionRows(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
        });

        const gpt4o = rows.find((r) => r.tenantId === "t1" && r.model === "gpt-4o");
        const gpt35 = rows.find((r) => r.tenantId === "t1" && r.model === "gpt-3.5");
        expect(gpt4o?.costUsd).toBeCloseTo(0.15, 8);
        expect(gpt35?.costUsd).toBeCloseTo(1, 8);
    });

    test.skipIf(!hasClickHouse)("excludes untagged-tenant rows", async () => {
        await insertUsageEvent(handle.ch, { tenantId: "", costUsd: "9.99000000" });
        await insertUsageEvent(handle.ch, { tenantId: "t1", costUsd: "0.10000000" });

        const rows = await fetchSpendCompositionRows(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]?.tenantId).toBe("t1");
    });

    test.skipIf(!hasClickHouse)("excludes blocked rows", async () => {
        await insertUsageEvent(handle.ch, { tenantId: "t1", costUsd: "0.10000000", status: "ok" });
        await insertUsageEvent(handle.ch, {
            tenantId: "t1",
            costUsd: "5.00000000",
            status: "blocked",
        });

        const rows = await fetchSpendCompositionRows(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]?.costUsd).toBeCloseTo(0.1, 8);
    });

    test.skipIf(!hasClickHouse)("window is half-open: row at `to` is excluded", async () => {
        await insertUsageEvent(handle.ch, { tenantId: "t1", costUsd: "0.10000000", ts: FROM });
        await insertUsageEvent(handle.ch, { tenantId: "t1", costUsd: "9.99000000", ts: TO });

        const rows = await fetchSpendCompositionRows(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]?.costUsd).toBeCloseTo(0.1, 8);
    });

    test.skipIf(!hasClickHouse)("other workspaces never leak", async () => {
        await insertUsageEvent(handle.ch, { tenantId: "t1", costUsd: "0.10000000" });
        await insertUsageEvent(handle.ch, {
            workspaceId: WORKSPACE_B,
            tenantId: "t1",
            costUsd: "9.99000000",
        });

        const rows = await fetchSpendCompositionRows(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]?.costUsd).toBeCloseTo(0.1, 8);
    });

    test.skipIf(!hasClickHouse)("empty workspace returns []", async () => {
        const rows = await fetchSpendCompositionRows(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
        });
        expect(rows).toEqual([]);
    });
});
