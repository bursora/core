/**
 * CH-backed contract tests for `clickHouseSpendRepository`, run against an
 * ephemeral database carved out of a live ClickHouse (env `CLICKHOUSE_URL`).
 *
 * Pins the spend read contract: SUM precision to the cent, epoch-floor
 * bucketing, and `(untagged)` mapping for absent (empty-string) facets.
 *
 * Skips cleanly when no live server is configured; CI provides one.
 */

import { clickHouseSpendRepository } from "@/lib/spend/clickhouse-spend.repository";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
    clickhouseTestConfig,
    createTestClickHouse,
    truncateTables,
    type TestClickHouseHandle,
} from "../support/clickhouse-db";

const hasClickHouse = clickhouseTestConfig() !== null;

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "99999999-8888-7777-6666-555555555555";

const WINDOW_START = new Date("2026-06-10T00:00:00Z");
const WINDOW_END = new Date("2026-06-11T00:00:00Z");

let handle: TestClickHouseHandle;

const repo = () => clickHouseSpendRepository(handle.ch);

interface EventOverrides {
    workspaceId?: string;
    tenantId?: string;
    agentId?: string;
    workflowId?: string;
    provider?: string;
    model?: string;
    costUsd?: string;
    status?: "ok" | "blocked";
    ts?: Date;
}

const toChDateTime = (d: Date): string => d.toISOString().replace("T", " ").replace("Z", "");

const insertEvent = async (overrides: EventOverrides = {}): Promise<void> => {
    await handle.ch.insert({
        table: "usage_events",
        values: [
            {
                id: randomUUID(),
                workspace_id: overrides.workspaceId ?? WORKSPACE_A,
                tenant_id: overrides.tenantId ?? "",
                agent_id: overrides.agentId ?? "",
                workflow_id: overrides.workflowId ?? "",
                provider: overrides.provider ?? "openai",
                model: overrides.model ?? "gpt-4o",
                prompt_tokens: 100,
                completion_tokens: 50,
                cache_tokens: 0,
                cost_usd: overrides.costUsd ?? "0.00000000",
                status: overrides.status ?? "ok",
                ts: toChDateTime(overrides.ts ?? new Date("2026-06-10T12:00:00Z")),
            },
        ],
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

describe("clickHouseSpendRepository.getSpendForScope", () => {
    test.skipIf(!hasClickHouse)("workspace scope sums all ok events in the window", async () => {
        await insertEvent({ ts: new Date("2026-06-10T08:00:00Z"), costUsd: "1.50000000" });
        await insertEvent({ ts: new Date("2026-06-10T16:00:00Z"), costUsd: "2.25000000" });

        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
        });

        expect(total).toBeCloseTo(3.75, 8);
    });

    test.skipIf(!hasClickHouse)("tenant scope restricts to that tenant id", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T08:00:00Z"),
            tenantId: "tenant-A",
            costUsd: "1.00000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T09:00:00Z"),
            tenantId: "tenant-B",
            costUsd: "9.99000000",
        });

        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "tenant",
            scopeId: "tenant-A",
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
        });

        expect(total).toBeCloseTo(1, 8);
    });

    test.skipIf(!hasClickHouse)(
        "window is half-open: row at `to` boundary is excluded",
        async () => {
            await insertEvent({ ts: WINDOW_START, costUsd: "1.00000000" });
            await insertEvent({ ts: WINDOW_END, costUsd: "9.99000000" });

            const total = await repo().getSpendForScope({
                workspaceId: WORKSPACE_A,
                scopeType: "workspace",
                scopeId: null,
                from: WINDOW_START,
                to: WINDOW_END,
                status: "ok",
            });

            expect(total).toBeCloseTo(1, 8);
        },
    );

    test.skipIf(!hasClickHouse)("status filter restricts rows: 'ok' ignores blocked", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T08:00:00Z"),
            costUsd: "1.00000000",
            status: "ok",
        });
        await insertEvent({
            ts: new Date("2026-06-10T09:00:00Z"),
            costUsd: "0.50000000",
            status: "blocked",
        });

        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
        });

        expect(total).toBeCloseTo(1, 8);
    });

    test.skipIf(!hasClickHouse)("status 'both' includes ok and blocked", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T08:00:00Z"),
            costUsd: "1.00000000",
            status: "ok",
        });
        await insertEvent({
            ts: new Date("2026-06-10T09:00:00Z"),
            costUsd: "0.25000000",
            status: "blocked",
        });

        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "both",
        });

        expect(total).toBeCloseTo(1.25, 8);
    });

    test.skipIf(!hasClickHouse)("MeteringFilters AND-combine across dimensions", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T10:00:00Z"),
            tenantId: "t1",
            agentId: "a1",
            workflowId: "w1",
            model: "gpt-4o",
            costUsd: "0.10000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T11:00:00Z"),
            tenantId: "t1",
            agentId: "a1",
            workflowId: "w1",
            model: "gpt-3.5",
            costUsd: "5.00000000",
        });

        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
            filters: {
                tenantId: ["t1"],
                agentId: ["a1"],
                workflowId: ["w1"],
                model: ["gpt-4o"],
            },
        });

        expect(total).toBeCloseTo(0.1, 8);
    });

    test.skipIf(!hasClickHouse)("workspace isolation: other workspaces never leak", async () => {
        await insertEvent({
            workspaceId: WORKSPACE_A,
            ts: new Date("2026-06-10T08:00:00Z"),
            costUsd: "1.00000000",
        });
        await insertEvent({
            workspaceId: WORKSPACE_B,
            ts: new Date("2026-06-10T09:00:00Z"),
            costUsd: "9.99000000",
        });

        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
        });

        expect(total).toBeCloseTo(1, 8);
    });

    test.skipIf(!hasClickHouse)("returns 0 for empty workspace", async () => {
        const total = await repo().getSpendForScope({
            workspaceId: WORKSPACE_A,
            scopeType: "workspace",
            scopeId: null,
            from: WINDOW_START,
            to: WINDOW_END,
            status: "ok",
        });

        expect(total).toBe(0);
    });
});

describe("clickHouseSpendRepository.getSpendSeries", () => {
    test.skipIf(!hasClickHouse)(
        "facet='tenant' with 1h bucket groups by (bucket, tenantId) and sums cost",
        async () => {
            await insertEvent({
                ts: new Date("2026-06-10T11:10:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.01000000",
            });
            await insertEvent({
                ts: new Date("2026-06-10T11:50:00Z"),
                tenantId: "tenant-A",
                costUsd: "0.02000000",
            });
            await insertEvent({
                ts: new Date("2026-06-10T10:30:00Z"),
                tenantId: "tenant-B",
                costUsd: "0.05000000",
            });

            const points = await repo().getSpendSeries({
                workspaceId: WORKSPACE_A,
                facet: "tenant",
                windowStart: WINDOW_START,
                windowEnd: WINDOW_END,
                bucketSeconds: 3600,
                status: "ok",
            });

            const aPoint = points.find((p) => p.tag === "tenant-A");
            const bPoint = points.find((p) => p.tag === "tenant-B");
            expect(aPoint?.costUsd).toBe("0.03000000");
            expect(aPoint?.callCount).toBe(2);
            expect(bPoint?.costUsd).toBe("0.05000000");
            expect(bPoint?.callCount).toBe(1);
        },
    );

    test.skipIf(!hasClickHouse)(
        "null facet values are returned as `(untagged)` literal",
        async () => {
            await insertEvent({
                ts: new Date("2026-06-10T11:30:00Z"),
                tenantId: "",
                costUsd: "0.07000000",
            });

            const points = await repo().getSpendSeries({
                workspaceId: WORKSPACE_A,
                facet: "tenant",
                windowStart: WINDOW_START,
                windowEnd: WINDOW_END,
                bucketSeconds: 3600,
                status: "ok",
            });

            expect(points).toHaveLength(1);
            expect(points[0]?.tag).toBe("(untagged)");
            expect(points[0]?.costUsd).toBe("0.07000000");
        },
    );

    test.skipIf(!hasClickHouse)("epoch-floor buckets align to the hour", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T11:10:00Z"),
            tenantId: "tenant-A",
            costUsd: "0.01000000",
        });

        const points = await repo().getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            bucketSeconds: 3600,
            status: "ok",
        });

        expect(points[0]?.bucket.toISOString()).toBe("2026-06-10T11:00:00.000Z");
    });

    test.skipIf(!hasClickHouse)("scopeId restricts series to a single facet value", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T11:10:00Z"),
            tenantId: "tenant-A",
            costUsd: "0.01000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T11:20:00Z"),
            tenantId: "tenant-B",
            costUsd: "0.05000000",
        });

        const points = await repo().getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            bucketSeconds: 3600,
            scopeId: "tenant-A",
            status: "ok",
        });

        expect(points).toHaveLength(1);
        expect(points[0]?.tag).toBe("tenant-A");
        expect(points[0]?.costUsd).toBe("0.01000000");
    });

    test.skipIf(!hasClickHouse)("provider MeteringFilter restricts rows", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T11:10:00Z"),
            tenantId: "t1",
            provider: "openai",
            costUsd: "0.01000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T11:20:00Z"),
            tenantId: "t1",
            provider: "anthropic",
            costUsd: "0.99000000",
        });

        const points = await repo().getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            bucketSeconds: 3600,
            status: "ok",
            filters: { provider: ["openai"] },
        });

        expect(points).toHaveLength(1);
        expect(points[0]?.costUsd).toBe("0.01000000");
    });

    test.skipIf(!hasClickHouse)("status='both' includes blocked rows", async () => {
        await insertEvent({
            ts: new Date("2026-06-10T11:10:00Z"),
            tenantId: "t1",
            status: "ok",
            costUsd: "0.10000000",
        });
        await insertEvent({
            ts: new Date("2026-06-10T11:20:00Z"),
            tenantId: "t1",
            status: "blocked",
            costUsd: "0.05000000",
        });

        const points = await repo().getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            bucketSeconds: 3600,
            status: "both",
        });

        const total = points
            .filter((p) => p.tag === "t1")
            .reduce((acc, p) => acc + Number.parseFloat(p.costUsd), 0);
        expect(total).toBeCloseTo(0.15, 8);
    });

    test.skipIf(!hasClickHouse)("empty result returns []", async () => {
        const points = await repo().getSpendSeries({
            workspaceId: WORKSPACE_A,
            facet: "tenant",
            windowStart: WINDOW_START,
            windowEnd: WINDOW_END,
            bucketSeconds: 3600,
            status: "ok",
        });

        expect(points).toEqual([]);
    });

    test.skipIf(!hasClickHouse)(
        "points are returned sorted by bucket ascending then tag ascending",
        async () => {
            await insertEvent({
                ts: new Date("2026-06-10T15:00:00Z"),
                tenantId: "b",
                costUsd: "0.01000000",
            });
            await insertEvent({
                ts: new Date("2026-06-10T10:00:00Z"),
                tenantId: "a",
                costUsd: "0.01000000",
            });
            await insertEvent({
                ts: new Date("2026-06-10T10:00:00Z"),
                tenantId: "z",
                costUsd: "0.01000000",
            });

            const points = await repo().getSpendSeries({
                workspaceId: WORKSPACE_A,
                facet: "tenant",
                windowStart: WINDOW_START,
                windowEnd: WINDOW_END,
                bucketSeconds: 3600,
                status: "ok",
            });

            const sequence = points.map((p) => `${p.bucket.toISOString()}|${p.tag}`);
            expect(sequence).toEqual([
                "2026-06-10T10:00:00.000Z|a",
                "2026-06-10T10:00:00.000Z|z",
                "2026-06-10T15:00:00.000Z|b",
            ]);
        },
    );
});
