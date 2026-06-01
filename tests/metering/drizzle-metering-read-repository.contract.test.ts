/**
 * DB-backed contract tests for the REAL `drizzleMeteringReadRepository`, run
 * against an in-memory PGlite Postgres with the production migrations applied.
 *
 * These cover the Postgres-specific behaviors the in-memory fake can only
 * approximate: FILTER aggregates + HAVING in `topSpenders`, epoch-floor UTC day
 * bucketing + running sum in `cumulativeSpendDaily`, and the compound `(ts, id)`
 * cursor in `listBlockedEventsForBudget` including the same-millisecond
 * tiebreak. Plus spot checks on the simpler count/last queries.
 *
 * `usage_events` is RANGE-partitioned by `ts`; the harness adds a DEFAULT
 * partition so any inserted `ts` lands cleanly regardless of when the suite runs.
 */

import { schema } from "@/lib/db";
import { drizzleMeteringReadRepository } from "@/lib/metering/drizzle-metering-read.repository";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestDb, truncateAll, type TestDbHandle } from "../support/pglite-db";

const WS = "00000000-0000-4000-8000-000000000001";
const WS_OTHER = "00000000-0000-4000-8000-0000000000ff";
const BUDGET = "00000000-0000-4000-8000-0000000000b1";
const BUDGET_OTHER = "00000000-0000-4000-8000-0000000000b2";

const COST_RE = /^\d+\.\d{8}$/;

type EventInsert = typeof schema.usageEvents.$inferInsert;

let h: TestDbHandle;

const repo = () => drizzleMeteringReadRepository(h.db);

const insertEvents = (rows: readonly Partial<EventInsert>[]): Promise<unknown> =>
    h.db.insert(schema.usageEvents).values(
        rows.map((r) => ({
            workspaceId: WS,
            costUsd: "0.00000000",
            status: "ok",
            ...r,
        })),
    );

beforeAll(async () => {
    h = await createTestDb();
});

afterAll(async () => {
    await h.close();
});

beforeEach(async () => {
    await truncateAll(h.pg);
    await h.db.insert(schema.workspaces).values([
        { id: WS, name: "acme" },
        { id: WS_OTHER, name: "other" },
    ]);
    await h.db.insert(schema.budgets).values([
        {
            id: BUDGET,
            workspaceId: WS,
            scopeType: "workspace",
            period: "monthly",
            amountUsd: "100.0000",
            mode: "block",
        },
        {
            id: BUDGET_OTHER,
            workspaceId: WS,
            scopeType: "workspace",
            period: "monthly",
            amountUsd: "100.0000",
            mode: "block",
        },
    ]);
});

describe("topSpenders", () => {
    const window = {
        windowStart: new Date("2026-06-01T00:00:00.000Z"),
        windowEnd: new Date("2026-07-01T00:00:00.000Z"),
    };

    beforeEach(async () => {
        await insertEvents([
            // alpha: two ok rows (1.0 + 2.0) + one blocked
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
            // beta: one ok row, no blocked
            {
                agentId: "beta",
                status: "ok",
                costUsd: "0.50000000",
                ts: new Date("2026-06-10T00:00:00Z"),
            },
            // gamma: only blocked rows
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
    });

    test("status 'ok': FILTER aggregates per tag, blocked dropped, blockedCount still reachable", async () => {
        const rows = await repo().topSpenders({
            workspaceId: WS,
            facet: "agent",
            limit: 10,
            ...window,
        });

        // gamma has no ok rows → HAVING drops it. Ordered by cost desc.
        expect(rows.map((r) => r.tag)).toEqual(["alpha", "beta"]);

        const alpha = rows[0];
        expect(alpha?.costUsd).toBe("3.00000000");
        expect(alpha?.callCount).toBe(2);
        expect(alpha?.blockedCount).toBe(1); // reachable alongside an 'ok' query

        const beta = rows[1];
        expect(beta?.costUsd).toBe("0.50000000");
        expect(beta?.callCount).toBe(1);
        expect(beta?.blockedCount).toBe(0);

        for (const r of rows) {
            expect(r.costUsd).toMatch(COST_RE);
            expect(Number.isInteger(r.callCount)).toBe(true);
            expect(Number.isInteger(r.blockedCount)).toBe(true);
        }
    });

    test("status 'blocked': FILTER counts blocked rows, ok-only tags dropped", async () => {
        const rows = await repo().topSpenders({
            workspaceId: WS,
            facet: "agent",
            limit: 10,
            status: "blocked",
            ...window,
        });

        const byTag = new Map(rows.map((r) => [r.tag, r]));
        // gamma now appears (2 blocked), alpha (1 blocked); beta dropped (0 blocked).
        expect(new Set(byTag.keys())).toEqual(new Set(["alpha", "gamma"]));
        expect(byTag.get("gamma")?.callCount).toBe(2);
        expect(byTag.get("gamma")?.blockedCount).toBe(2);
        expect(byTag.get("alpha")?.callCount).toBe(1);
    });

    test("status 'both': unconditional aggregates keep every tag", async () => {
        const rows = await repo().topSpenders({
            workspaceId: WS,
            facet: "agent",
            limit: 10,
            status: "both",
            ...window,
        });
        expect(new Set(rows.map((r) => r.tag))).toEqual(new Set(["alpha", "beta", "gamma"]));
        const alpha = rows.find((r) => r.tag === "alpha");
        expect(alpha?.callCount).toBe(3); // all rows
        expect(alpha?.costUsd).toBe("3.00000000");
    });

    test("limit caps the result after cost-desc ordering", async () => {
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
    const to = new Date("2026-06-13T00:00:00.000Z"); // 3-day window

    test("epoch-floor day buckets + running cumulative sum", async () => {
        await insertEvents([
            // day 0: 1.0, plus a late-in-day row that must floor into the same bucket
            { status: "ok", costUsd: "0.75000000", ts: new Date("2026-06-10T01:00:00Z") },
            { status: "ok", costUsd: "0.25000000", ts: new Date("2026-06-10T23:30:00Z") },
            // day 1: nothing
            // day 2: 2.0
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

    test("scope restriction + half-open window", async () => {
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
            // exactly at `to` → excluded (half-open)
            { tenantId: "t1", status: "ok", costUsd: "9.00000000", ts: to },
            // blocked → excluded (hardcoded 'ok')
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
    // Two rows share the latest ts → exercise the (ts, id) compound cursor.
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

    beforeEach(async () => {
        await insertEvents([
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
            // noise: wrong budget + an ok row on this budget
            { status: "blocked", decidedByBudgetId: BUDGET_OTHER, ts: T2 },
            { status: "ok", decidedByBudgetId: BUDGET, ts: T3 },
        ]);
    });

    test("DESC (ts, id) order, hasMore via limit+1, nextCursor populated", async () => {
        const page = await repo().listBlockedEventsForBudget({ ...query, limit: 2 });
        expect(page.items.map((i) => i.blockReason)).toEqual(["r-hi", "r-lo"]);
        expect(page.items[0]?.intendedProvider).toBe("openai");
        expect(page.items[0]?.intendedModel).toBe("gpt-4o");
        expect(page.nextCursor).not.toBeNull();
    });

    test("same-millisecond tiebreak: page boundary between two same-ts rows drops nothing", async () => {
        // limit=1 splits the two T3 rows across the page boundary.
        const p1 = await repo().listBlockedEventsForBudget({ ...query, limit: 1 });
        expect(p1.items.map((i) => i.blockReason)).toEqual(["r-hi"]);
        expect(p1.nextCursor).not.toBeNull();

        const p2 = await repo().listBlockedEventsForBudget({
            ...query,
            limit: 1,
            ...(p1.nextCursor ? { cursor: p1.nextCursor } : {}),
        });
        // r-lo shares ts with r-hi; the id tiebreak keeps it instead of skipping to r2.
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
    });
});

describe("count + last spot checks", () => {
    test("countBlockedEventsForBudget scopes to budget + window", async () => {
        await insertEvents([
            { status: "blocked", decidedByBudgetId: BUDGET, ts: new Date("2026-06-10T00:00:00Z") },
            { status: "blocked", decidedByBudgetId: BUDGET, ts: new Date("2026-06-11T00:00:00Z") },
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
    });

    test("countEvents defaults to status 'ok' and honors `since`", async () => {
        await insertEvents([
            { status: "ok", ts: new Date("2026-06-05T00:00:00Z") },
            { status: "ok", ts: new Date("2026-06-20T00:00:00Z") },
            { status: "blocked", ts: new Date("2026-06-20T00:00:00Z") },
        ]);
        const all = await repo().countEvents({ workspaceId: WS });
        expect(all).toBe(2); // blocked excluded by default

        const recent = await repo().countEvents({
            workspaceId: WS,
            since: new Date("2026-06-10T00:00:00Z"),
        });
        expect(recent).toBe(1);
    });

    test("getLastUsageEventAt returns latest 'ok' ts, ignoring blocked", async () => {
        await insertEvents([
            { status: "ok", ts: new Date("2026-06-15T00:00:00Z") },
            { status: "ok", ts: new Date("2026-06-18T00:00:00Z") },
            // later, but blocked → must not win
            { status: "blocked", ts: new Date("2026-06-25T00:00:00Z") },
        ]);
        const last = await repo().getLastUsageEventAt({ workspaceId: WS });
        expect(last?.toISOString()).toBe("2026-06-18T00:00:00.000Z");
    });

    test("getLastUsageEventAt returns null for an empty workspace", async () => {
        const last = await repo().getLastUsageEventAt({ workspaceId: WS_OTHER });
        expect(last).toBeNull();
    });
});
