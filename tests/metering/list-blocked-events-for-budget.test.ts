/**
 * Tests for `listBlockedEventsForBudget` on the metering read repository.
 *
 * Powers the Blocks tab table on /budgets/[id]. Returns per-event rows newest
 * first, with cursor pagination on `ts`. Filters: workspace + budget +
 * `status='blocked'` + period window.
 */

import type { UsageEventRow } from "@/lib/metering";
import { describe, expect, test } from "bun:test";
import { InMemoryMeteringReadRepository } from "./fakes/in-memory-metering-read.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "22222222-3333-4444-5555-666666666666";
const BUDGET_ID = "99999999-0000-1111-2222-333333333333";
const OTHER_BUDGET_ID = "88888888-1111-2222-3333-444444444444";

const PERIOD_FROM = new Date("2025-05-01T00:00:00Z");
const PERIOD_TO = new Date("2025-06-01T00:00:00Z");

const blocked = (overrides: Partial<UsageEventRow> = {}): UsageEventRow => ({
    workspaceId: WORKSPACE_A,
    tenantId: "tenant-A",
    agentId: "agent-X",
    workflowId: null,
    provider: "openai",
    model: "gpt-4o",
    promptTokens: 0,
    completionTokens: 0,
    cacheTokens: 0,
    latencyMs: null,
    costUsd: "0.00000000",
    requestId: null,
    ts: new Date("2025-05-10T10:00:00Z"),
    status: "blocked",
    decidedByBudgetId: BUDGET_ID,
    ...overrides,
});

describe("listBlockedEventsForBudget", () => {
    test("returns empty rows and null cursor when no blocked events match", async () => {
        const repo = new InMemoryMeteringReadRepository();

        const page = await repo.listBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
            limit: 50,
        });

        expect(page.items).toEqual([]);
        expect(page.nextCursor).toBeNull();
    });

    test("returns matching rows newest first with tenantId/agentId/workflowId", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(
            blocked({
                ts: new Date("2025-05-10T10:00:00Z"),
                tenantId: "tenant-1",
                agentId: "agent-A",
                workflowId: "wf-1",
            }),
        );
        repo.add(
            blocked({
                ts: new Date("2025-05-12T10:00:00Z"),
                tenantId: "tenant-2",
                agentId: null,
                workflowId: null,
            }),
        );
        repo.add(
            blocked({
                ts: new Date("2025-05-11T10:00:00Z"),
                tenantId: null,
                agentId: "agent-B",
                workflowId: "wf-2",
            }),
        );

        const page = await repo.listBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
            limit: 50,
        });

        expect(page.items.map((r) => r.ts)).toEqual([
            "2025-05-12T10:00:00.000Z",
            "2025-05-11T10:00:00.000Z",
            "2025-05-10T10:00:00.000Z",
        ]);
        expect(page.items[0]).toEqual({
            ts: "2025-05-12T10:00:00.000Z",
            tenantId: "tenant-2",
            agentId: null,
            workflowId: null,
            intendedProvider: "openai",
            intendedModel: "gpt-4o",
            blockReason: null,
        });
        expect(page.items[2]).toEqual({
            ts: "2025-05-10T10:00:00.000Z",
            tenantId: "tenant-1",
            agentId: "agent-A",
            workflowId: "wf-1",
            intendedProvider: "openai",
            intendedModel: "gpt-4o",
            blockReason: null,
        });
        expect(page.nextCursor).toBeNull();
    });

    test("emits nextCursor when more rows exist than the limit", async () => {
        const repo = new InMemoryMeteringReadRepository();
        for (let day = 1; day <= 5; day++) {
            const ts = new Date(`2025-05-0${day}T10:00:00Z`);
            repo.add(blocked({ ts }));
        }

        const page = await repo.listBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
            limit: 2,
        });

        expect(page.items).toHaveLength(2);
        expect(page.items.map((r) => r.ts)).toEqual([
            "2025-05-05T10:00:00.000Z",
            "2025-05-04T10:00:00.000Z",
        ]);
        expect(page.nextCursor).toMatch(/^2025-05-04T10:00:00\.000Z\|.+/);
    });

    test("uses cursor to return rows strictly older than the cursor", async () => {
        const repo = new InMemoryMeteringReadRepository();
        for (let day = 1; day <= 5; day++) {
            const ts = new Date(`2025-05-0${day}T10:00:00Z`);
            repo.add(blocked({ ts }));
        }

        const seedPage = await repo.listBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
            limit: 2,
        });
        const cursor = seedPage.nextCursor;
        if (cursor === null) throw new Error("unreachable");

        const page = await repo.listBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
            cursor,
            limit: 50,
        });

        expect(page.items.map((r) => r.ts)).toEqual([
            "2025-05-03T10:00:00.000Z",
            "2025-05-02T10:00:00.000Z",
            "2025-05-01T10:00:00.000Z",
        ]);
        expect(page.nextCursor).toBeNull();
    });

    test("excludes ok-status rows and rows for other budgets", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(blocked({ ts: new Date("2025-05-05T10:00:00Z") }));
        repo.add(
            blocked({
                ts: new Date("2025-05-06T10:00:00Z"),
                status: "ok",
            }),
        );
        repo.add(
            blocked({
                ts: new Date("2025-05-07T10:00:00Z"),
                decidedByBudgetId: OTHER_BUDGET_ID,
            }),
        );
        repo.add(
            blocked({
                ts: new Date("2025-05-08T10:00:00Z"),
                decidedByBudgetId: null,
            }),
        );

        const page = await repo.listBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
            limit: 50,
        });

        expect(page.items.map((r) => r.ts)).toEqual(["2025-05-05T10:00:00.000Z"]);
    });

    test("excludes rows from other workspaces and outside the window", async () => {
        const repo = new InMemoryMeteringReadRepository();
        repo.add(blocked());
        repo.add(blocked({ workspaceId: WORKSPACE_B }));
        repo.add(blocked({ ts: new Date("2025-04-30T23:59:59Z") }));
        repo.add(blocked({ ts: new Date("2025-06-01T00:00:00Z") }));

        const page = await repo.listBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
            limit: 50,
        });

        expect(page.items).toHaveLength(1);
        expect(page.items[0]?.ts).toBe("2025-05-10T10:00:00.000Z");
    });

    test("pages through rows with identical timestamps without losing any", async () => {
        // Regression: at high block rates, `defaultRecordBlocked` stamps
        // `ts: input.now` for every denial. A burst with equal ts at the
        // page boundary used to silently skip rows because the cursor was a
        // bare `ts < cursor`. The cursor now carries `{ts, id}` and the
        // tiebreaker keeps every row addressable.
        const repo = new InMemoryMeteringReadRepository();
        const SAME_TS = new Date("2025-05-10T10:00:00Z");
        for (let i = 0; i < 5; i++) repo.add(blocked({ ts: SAME_TS }));

        const first = await repo.listBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
            limit: 2,
        });

        expect(first.items).toHaveLength(2);
        expect(first.nextCursor).not.toBeNull();
        const cursor1 = first.nextCursor;
        if (cursor1 === null) throw new Error("unreachable");

        const second = await repo.listBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
            limit: 2,
            cursor: cursor1,
        });

        expect(second.items).toHaveLength(2);
        expect(second.nextCursor).not.toBeNull();
        const cursor2 = second.nextCursor;
        if (cursor2 === null) throw new Error("unreachable");

        const third = await repo.listBlockedEventsForBudget({
            workspaceId: WORKSPACE_A,
            budgetId: BUDGET_ID,
            from: PERIOD_FROM,
            to: PERIOD_TO,
            limit: 2,
            cursor: cursor2,
        });

        expect(third.items).toHaveLength(1);
        expect(third.nextCursor).toBeNull();
    });
});
