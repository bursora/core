/**
 * CH-backed contract test for `fetchBudgetSpendRollup`, run against an
 * ephemeral database carved out of a live ClickHouse (env `CLICKHOUSE_URL`).
 *
 * Verifies the /budgets per-budget spend rollup: per-model SUM(cost) to the
 * cent, call counts, summed token totals, the workspace-wide vs narrowed-scope
 * grouping, the `status='ok'` filter, the half-open window, and the empty-ids
 * short-circuit. Skips when no live server is configured.
 */

import { fetchBudgetSpendRollup } from "@/lib/budgeting/server";
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

describe("fetchBudgetSpendRollup (workspace aggregate)", () => {
    test.skipIf(!hasClickHouse)("groups by model with cost, calls, and token totals", async () => {
        await insertUsageEvent(handle.ch, {
            model: "gpt-4o",
            costUsd: "0.10000000",
            promptTokens: 100,
            completionTokens: 50,
            cacheTokens: 10,
            ts: new Date("2026-06-10T08:00:00Z"),
        });
        await insertUsageEvent(handle.ch, {
            model: "gpt-4o",
            costUsd: "0.05000000",
            promptTokens: 20,
            completionTokens: 0,
            cacheTokens: 0,
            ts: new Date("2026-06-10T09:00:00Z"),
        });
        await insertUsageEvent(handle.ch, {
            model: "gpt-3.5",
            costUsd: "1.00000000",
            promptTokens: 5,
            completionTokens: 5,
            cacheTokens: 0,
            ts: new Date("2026-06-10T10:00:00Z"),
        });

        const rows = await fetchBudgetSpendRollup(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
        });

        const gpt4o = rows.find((r) => r.model === "gpt-4o");
        const gpt35 = rows.find((r) => r.model === "gpt-3.5");
        expect(Number.parseFloat(gpt4o?.cost ?? "0")).toBeCloseTo(0.15, 8);
        expect(gpt4o?.calls).toBe(2);
        expect(Number(gpt4o?.tokens)).toBe(180);
        expect(gpt4o?.scopeId).toBeNull();
        expect(Number.parseFloat(gpt35?.cost ?? "0")).toBeCloseTo(1, 8);
        expect(gpt35?.calls).toBe(1);
        expect(Number(gpt35?.tokens)).toBe(10);
    });

    test.skipIf(!hasClickHouse)("maps an empty-string model back to null", async () => {
        await insertUsageEvent(handle.ch, { model: "", costUsd: "0.10000000" });

        const rows = await fetchBudgetSpendRollup(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]?.model).toBeNull();
    });

    test.skipIf(!hasClickHouse)("excludes blocked rows", async () => {
        await insertUsageEvent(handle.ch, { model: "gpt-4o", costUsd: "0.10000000", status: "ok" });
        await insertUsageEvent(handle.ch, {
            model: "gpt-4o",
            costUsd: "5.00000000",
            status: "blocked",
        });

        const rows = await fetchBudgetSpendRollup(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
        });

        expect(rows).toHaveLength(1);
        expect(Number.parseFloat(rows[0]?.cost ?? "0")).toBeCloseTo(0.1, 8);
    });

    test.skipIf(!hasClickHouse)("window is half-open: row at `to` excluded", async () => {
        await insertUsageEvent(handle.ch, { model: "gpt-4o", costUsd: "0.10000000", ts: FROM });
        await insertUsageEvent(handle.ch, { model: "gpt-4o", costUsd: "9.99000000", ts: TO });

        const rows = await fetchBudgetSpendRollup(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
        });

        expect(Number.parseFloat(rows[0]?.cost ?? "0")).toBeCloseTo(0.1, 8);
    });
});

describe("fetchBudgetSpendRollup (narrowed scope)", () => {
    test.skipIf(!hasClickHouse)("groups by (scope, model) restricted to the id set", async () => {
        await insertUsageEvent(handle.ch, {
            tenantId: "t1",
            model: "gpt-4o",
            costUsd: "0.10000000",
        });
        await insertUsageEvent(handle.ch, {
            tenantId: "t2",
            model: "gpt-4o",
            costUsd: "0.20000000",
        });
        await insertUsageEvent(handle.ch, {
            tenantId: "t3",
            model: "gpt-4o",
            costUsd: "9.99000000",
        });

        const rows = await fetchBudgetSpendRollup(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
            scope: { column: "tenant_id", ids: ["t1", "t2"] },
        });

        const t1 = rows.find((r) => r.scopeId === "t1");
        const t2 = rows.find((r) => r.scopeId === "t2");
        const t3 = rows.find((r) => r.scopeId === "t3");
        expect(Number.parseFloat(t1?.cost ?? "0")).toBeCloseTo(0.1, 8);
        expect(Number.parseFloat(t2?.cost ?? "0")).toBeCloseTo(0.2, 8);
        expect(t3).toBeUndefined();
    });

    test.skipIf(!hasClickHouse)("empty id set short-circuits to []", async () => {
        await insertUsageEvent(handle.ch, { tenantId: "t1", costUsd: "0.10000000" });

        const rows = await fetchBudgetSpendRollup(handle.ch, {
            workspaceId: CONTRACT_WORKSPACE,
            from: FROM,
            to: TO,
            scope: { column: "tenant_id", ids: [] },
        });

        expect(rows).toEqual([]);
    });
});
