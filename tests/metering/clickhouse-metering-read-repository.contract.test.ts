/**
 * CH-backed contract tests for `clickHouseMeteringReadRepository`, run against
 * an ephemeral database carved out of a live ClickHouse (env `CLICKHOUSE_URL`).
 *
 * Pins the metering read contract: conditional aggregates + HAVING in
 * `topSpenders`, epoch-floor UTC day bucketing + running sum in
 * `cumulativeSpendDaily`, and the compound `(ts, id)` cursor in
 * `listBlockedEventsForBudget` including the same-millisecond tiebreak.
 *
 * Skips cleanly when no live server is configured; CI provides one.
 */

import { clickHouseMeteringReadRepository } from "@/lib/metering/clickhouse-metering-read.repository";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
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
const BUDGET = "00000000-0000-4000-8000-0000000000b1";
const BUDGET_OTHER = "00000000-0000-4000-8000-0000000000b2";

const COST_RE = /^\d+\.\d{8}$/;

let handle: TestClickHouseHandle;

const repo = () => clickHouseMeteringReadRepository(handle.ch);

interface EventOverrides {
    id?: string;
    workspaceId?: string;
    tenantId?: string;
    agentId?: string;
    workflowId?: string;
    provider?: string;
    model?: string;
    costUsd?: string;
    status?: "ok" | "blocked";
    decidedByBudgetId?: string;
    blockReason?: string;
    ts?: Date;
}

const toChDateTime = (d: Date): string => d.toISOString().replace("T", " ").replace("Z", "");

const insertEvents = async (rows: readonly EventOverrides[]): Promise<void> => {
    await handle.ch.insert({
        table: "usage_events",
        values: rows.map((r) => ({
            id: r.id ?? randomUUID(),
            workspace_id: r.workspaceId ?? WS,
            tenant_id: r.tenantId ?? "",
            agent_id: r.agentId ?? "",
            workflow_id: r.workflowId ?? "",
            provider: r.provider ?? "",
            model: r.model ?? "",
            prompt_tokens: 0,
            completion_tokens: 0,
            cache_tokens: 0,
            cost_usd: r.costUsd ?? "0.00000000",
            status: r.status ?? "ok",
            decided_by_budget_id: r.decidedByBudgetId ?? null,
            block_reason: r.blockReason ?? null,
            ts: toChDateTime(r.ts ?? new Date("2026-06-10T00:00:00Z")),
        })),
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

describe("topSpenders", () => {
    const window = {
        windowStart: new Date("2026-06-01T00:00:00.000Z"),
        windowEnd: new Date("2026-07-01T00:00:00.000Z"),
    };

    const seed = () =>
        insertEvents([
            {
                agentId: "alpha",
                status: "ok",
                costUsd: "1.00000000",
                ts: new Date("2026-06-10T00:00:00Z"),
            },
            {
                agentId: "alpha",
                status: "ok",
                costUsd: "2.00000000",
                ts: new Date("2026-06-11T00:00:00Z"),
            },
            {
                agentId: "alpha",
                status: "blocked",
                costUsd: "0.00000000",
                ts: new Date("2026-06-12T00:00:00Z"),
            },
            {
                agentId: "beta",
                status: "ok",
                costUsd: "0.50000000",
                ts: new Date("2026-06-10T00:00:00Z"),
            },
            {
                agentId: "gamma",
                status: "blocked",
                costUsd: "0.00000000",
                ts: new Date("2026-06-10T00:00:00Z"),
            },
            {
                agentId: "gamma",
                status: "blocked",
                costUsd: "0.00000000",
                ts: new Date("2026-06-11T00:00:00Z"),
            },
        ]);

    test.skipIf(!hasClickHouse)(
        "status 'ok': conditional aggregates per tag, blocked dropped, blockedCount still reachable",
        async () => {
            await seed();
            const rows = await repo().topSpenders({
                workspaceId: WS,
                facet: "agent",
                limit: 10,
                ...window,
            });

            expect(rows.map((r) => r.tag)).toEqual(["alpha", "beta"]);

            const alpha = rows[0];
            expect(alpha?.costUsd).toBe("3.00000000");
            expect(alpha?.callCount).toBe(2);
            expect(alpha?.blockedCount).toBe(1);

            const beta = rows[1];
            expect(beta?.costUsd).toBe("0.50000000");
            expect(beta?.callCount).toBe(1);
            expect(beta?.blockedCount).toBe(0);

            for (const r of rows) {
                expect(r.costUsd).toMatch(COST_RE);
                expect(Number.isInteger(r.callCount)).toBe(true);
                expect(Number.isInteger(r.blockedCount)).toBe(true);
            }
        },
    );

    test.skipIf(!hasClickHouse)(
        "status 'blocked': conditional counts blocked rows, ok-only tags dropped",
        async () => {
            await seed();
            const rows = await repo().topSpenders({
                workspaceId: WS,
                facet: "agent",
                limit: 10,
                status: "blocked",
                ...window,
            });

            const byTag = new Map(rows.map((r) => [r.tag, r]));
            expect(new Set(byTag.keys())).toEqual(new Set(["alpha", "gamma"]));
            expect(byTag.get("gamma")?.callCount).toBe(2);
            expect(byTag.get("gamma")?.blockedCount).toBe(2);
            expect(byTag.get("alpha")?.callCount).toBe(1);
        },
    );

    test.skipIf(!hasClickHouse)(
        "status 'both': unconditional aggregates keep every tag",
        async () => {
            await seed();
            const rows = await repo().topSpenders({
                workspaceId: WS,
                facet: "agent",
                limit: 10,
                status: "both",
                ...window,
            });
            expect(new Set(rows.map((r) => r.tag))).toEqual(new Set(["alpha", "beta", "gamma"]));
            const alpha = rows.find((r) => r.tag === "alpha");
            expect(alpha?.callCount).toBe(3);
            expect(alpha?.costUsd).toBe("3.00000000");
        },
    );

    test.skipIf(!hasClickHouse)("limit caps the result after cost-desc ordering", async () => {
        await seed();
        const rows = await repo().topSpenders({
            workspaceId: WS,
            facet: "agent",
            limit: 1,
            ...window,
        });
        expect(rows.map((r) => r.tag)).toEqual(["alpha"]);
    });
});

describe("cumulativeSpendDaily", () => {
    const from = new Date("2026-06-10T00:00:00.000Z");
    const to = new Date("2026-06-13T00:00:00.000Z");

    test.skipIf(!hasClickHouse)("epoch-floor day buckets + running cumulative sum", async () => {
        await insertEvents([
            { status: "ok", costUsd: "0.75000000", ts: new Date("2026-06-10T01:00:00Z") },
            { status: "ok", costUsd: "0.25000000", ts: new Date("2026-06-10T23:30:00Z") },
            { status: "ok", costUsd: "2.00000000", ts: new Date("2026-06-12T12:00:00Z") },
        ]);

        const series = await repo().cumulativeSpendDaily({
            workspaceId: WS,
            scopeType: "workspace",
            scopeId: null,
            from,
            to,
        });
        expect(series).toEqual([1, 1, 3]);
    });

    test.skipIf(!hasClickHouse)("scope restriction + half-open window", async () => {
        await insertEvents([
            {
                tenantId: "t1",
                status: "ok",
                costUsd: "1.00000000",
                ts: new Date("2026-06-10T06:00:00Z"),
            },
            {
                tenantId: "t2",
                status: "ok",
                costUsd: "5.00000000",
                ts: new Date("2026-06-11T06:00:00Z"),
            },
            { tenantId: "t1", status: "ok", costUsd: "9.00000000", ts: to },
            {
                tenantId: "t1",
                status: "blocked",
                costUsd: "0.00000000",
                ts: new Date("2026-06-10T07:00:00Z"),
            },
        ]);

        const series = await repo().cumulativeSpendDaily({
            workspaceId: WS,
            scopeType: "tenant",
            scopeId: "t1",
            from,
            to,
        });
        expect(series).toEqual([1, 1, 1]);
    });
});

describe("listBlockedEventsForBudget", () => {
    const T1 = new Date("2026-06-18T10:00:00.000Z");
    const T2 = new Date("2026-06-19T10:00:00.000Z");
    const T3 = new Date("2026-06-20T10:00:00.000Z");
    const ID_T3_HI = "00000000-0000-4000-8000-0000000033ff";
    const ID_T3_LO = "00000000-0000-4000-8000-00000000330f";

    const query = {
        workspaceId: WS,
        budgetId: BUDGET,
        from: new Date("2026-06-01T00:00:00Z"),
        to: new Date("2026-07-01T00:00:00Z"),
    };

    const seed = () =>
        insertEvents([
            {
                id: ID_T3_HI,
                status: "blocked",
                decidedByBudgetId: BUDGET,
                ts: T3,
                blockReason: "r-hi",
                provider: "openai",
                model: "gpt-4o",
            },
            {
                id: ID_T3_LO,
                status: "blocked",
                decidedByBudgetId: BUDGET,
                ts: T3,
                blockReason: "r-lo",
            },
            { status: "blocked", decidedByBudgetId: BUDGET, ts: T2, blockReason: "r2" },
            { status: "blocked", decidedByBudgetId: BUDGET, ts: T1, blockReason: "r1" },
            { status: "blocked", decidedByBudgetId: BUDGET_OTHER, ts: T2 },
            { status: "ok", decidedByBudgetId: BUDGET, ts: T3 },
        ]);

    test.skipIf(!hasClickHouse)(
        "DESC (ts, id) order, hasMore via limit+1, nextCursor populated",
        async () => {
            await seed();
            const page = await repo().listBlockedEventsForBudget({ ...query, limit: 2 });
            expect(page.items.map((i) => i.blockReason)).toEqual(["r-hi", "r-lo"]);
            expect(page.items[0]?.intendedProvider).toBe("openai");
            expect(page.items[0]?.intendedModel).toBe("gpt-4o");
            expect(page.nextCursor).not.toBeNull();
        },
    );

    test.skipIf(!hasClickHouse)(
        "same-millisecond tiebreak: page boundary between two same-ts rows drops nothing",
        async () => {
            await seed();
            const p1 = await repo().listBlockedEventsForBudget({ ...query, limit: 1 });
            expect(p1.items.map((i) => i.blockReason)).toEqual(["r-hi"]);
            expect(p1.nextCursor).not.toBeNull();

            const p2 = await repo().listBlockedEventsForBudget({
                ...query,
                limit: 1,
                ...(p1.nextCursor ? { cursor: p1.nextCursor } : {}),
            });
            expect(p2.items.map((i) => i.blockReason)).toEqual(["r-lo"]);

            const p3 = await repo().listBlockedEventsForBudget({
                ...query,
                limit: 1,
                ...(p2.nextCursor ? { cursor: p2.nextCursor } : {}),
            });
            expect(p3.items.map((i) => i.blockReason)).toEqual(["r2"]);

            const p4 = await repo().listBlockedEventsForBudget({
                ...query,
                limit: 1,
                ...(p3.nextCursor ? { cursor: p3.nextCursor } : {}),
            });
            expect(p4.items.map((i) => i.blockReason)).toEqual(["r1"]);
            expect(p4.nextCursor).toBeNull();
        },
    );
});

describe("count + last spot checks", () => {
    test.skipIf(!hasClickHouse)(
        "countBlockedEventsForBudget scopes to budget + window",
        async () => {
            await insertEvents([
                {
                    status: "blocked",
                    decidedByBudgetId: BUDGET,
                    ts: new Date("2026-06-10T00:00:00Z"),
                },
                {
                    status: "blocked",
                    decidedByBudgetId: BUDGET,
                    ts: new Date("2026-06-11T00:00:00Z"),
                },
                {
                    status: "blocked",
                    decidedByBudgetId: BUDGET_OTHER,
                    ts: new Date("2026-06-10T00:00:00Z"),
                },
                { status: "ok", decidedByBudgetId: BUDGET, ts: new Date("2026-06-10T00:00:00Z") },
            ]);
            const n = await repo().countBlockedEventsForBudget({
                workspaceId: WS,
                budgetId: BUDGET,
                from: new Date("2026-06-01T00:00:00Z"),
                to: new Date("2026-07-01T00:00:00Z"),
            });
            expect(n).toBe(2);
            expect(Number.isInteger(n)).toBe(true);
        },
    );

    test.skipIf(!hasClickHouse)(
        "countEvents defaults to status 'ok' and honors `since`",
        async () => {
            await insertEvents([
                { status: "ok", ts: new Date("2026-06-05T00:00:00Z") },
                { status: "ok", ts: new Date("2026-06-20T00:00:00Z") },
                { status: "blocked", ts: new Date("2026-06-20T00:00:00Z") },
            ]);
            const all = await repo().countEvents({ workspaceId: WS });
            expect(all).toBe(2);

            const recent = await repo().countEvents({
                workspaceId: WS,
                since: new Date("2026-06-10T00:00:00Z"),
            });
            expect(recent).toBe(1);
        },
    );

    test.skipIf(!hasClickHouse)(
        "getLastUsageEventAt returns latest 'ok' ts, ignoring blocked",
        async () => {
            await insertEvents([
                { status: "ok", ts: new Date("2026-06-15T00:00:00Z") },
                { status: "ok", ts: new Date("2026-06-18T00:00:00Z") },
                { status: "blocked", ts: new Date("2026-06-25T00:00:00Z") },
            ]);
            const last = await repo().getLastUsageEventAt({ workspaceId: WS });
            expect(last?.toISOString()).toBe("2026-06-18T00:00:00.000Z");
        },
    );

    test.skipIf(!hasClickHouse)(
        "getLastUsageEventAt returns null for an empty workspace",
        async () => {
            const last = await repo().getLastUsageEventAt({ workspaceId: WS_OTHER });
            expect(last).toBeNull();
        },
    );

    test.skipIf(!hasClickHouse)(
        "listDistinctValuesBulk returns counts per scope, untagged excluded",
        async () => {
            await insertEvents([
                { tenantId: "t1", status: "ok", ts: new Date("2026-05-20T00:00:00Z") },
                { tenantId: "t1", status: "ok", ts: new Date("2026-05-21T00:00:00Z") },
                { tenantId: "t2", status: "ok", ts: new Date("2026-05-20T00:00:00Z") },
                { tenantId: "", status: "ok", ts: new Date("2026-05-20T00:00:00Z") },
            ]);

            const result = await repo().listDistinctValuesBulk({
                workspaceId: WS,
                scopes: ["tenant"],
                sinceDays: 30,
                limit: 50,
                now: new Date("2026-06-01T00:00:00Z"),
            });

            expect(result.tenant).toEqual([
                { value: "t1", count: 2 },
                { value: "t2", count: 1 },
            ]);
        },
    );
});
