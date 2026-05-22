/**
 * Tests for the listAlerts use case.
 *
 * The use case backs the /alerts dashboard feed. Behaviors:
 *   1. Returns alerts newest first (raised_at desc).
 *   2. Filters by from cutoff (raised_at >= from).
 *   3. Filters by to bound (raised_at < to) when supplied.
 *   4. Tenant/agent filters narrow by scope tag.
 *   5. Limit caps the result set (default 100).
 *   6. Workspace isolation: never returns alerts from another workspace.
 *   7. Empty result returned when no alerts match.
 */

import type { Alert, AlertRepository, AnomalyAlert, ListAlertsQuery } from "@/lib/detection";
import { listAlertsUseCase } from "@/lib/detection";
import { describe, expect, test } from "bun:test";

const NOW = new Date("2025-05-10T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "99999999-8888-7777-6666-555555555555";

const alert = (overrides: Partial<AnomalyAlert> = {}): AnomalyAlert => {
    const raisedAt = overrides.raisedAt ?? NOW;
    return {
        kind: "anomaly",
        scope: {
            workspaceId: WORKSPACE_A,
            tenantId: null,
            agentId: null,
        },
        reason: "spike",
        deviation: 4.5,
        severity: "warning",
        raisedAt,
        windowStart: raisedAt,
        windowEnd: new Date(raisedAt.getTime() + 5 * 60_000),
        windowCostUsd: 0.05,
        ...overrides,
    };
};

class InMemoryAlertRepo implements AlertRepository {
    readonly rows: AnomalyAlert[] = [];
    private nextId = 0;
    async insertBatch(
        alerts: readonly AnomalyAlert[],
    ): Promise<readonly { readonly alert: AnomalyAlert; readonly id: string }[]> {
        this.rows.push(...alerts);
        return alerts.map((alert) => {
            this.nextId += 1;
            const id = `00000000-0000-0000-0000-${this.nextId.toString(16).padStart(12, "0")}`;
            return { alert, id };
        });
    }
    async recordBudgetCrossing(): Promise<{ inserted: boolean; id: string | null }> {
        return { inserted: false, id: null };
    }
    async insert(a: AnomalyAlert): Promise<void> {
        await this.insertBatch([a]);
    }
    async listForWorkspace(q: ListAlertsQuery): Promise<readonly Alert[]> {
        return this.rows
            .filter((r) => r.scope.workspaceId === q.workspaceId)
            .filter((r) => r.raisedAt.getTime() >= q.since.getTime())
            .filter((r) =>
                q.until === undefined ? true : r.raisedAt.getTime() < q.until.getTime(),
            )
            .filter((r) =>
                q.tenantId === undefined || q.tenantId.length === 0
                    ? true
                    : r.scope.tenantId !== null && q.tenantId.includes(r.scope.tenantId),
            )
            .filter((r) =>
                q.agentId === undefined || q.agentId.length === 0
                    ? true
                    : r.scope.agentId !== null && q.agentId.includes(r.scope.agentId),
            )
            .slice()
            .sort((a, b) => b.raisedAt.getTime() - a.raisedAt.getTime())
            .slice(0, q.limit);
    }
}

const since24h = new Date(NOW.getTime() - 24 * HOUR_MS);
const since7d = new Date(NOW.getTime() - 7 * DAY_MS);
const since30d = new Date(NOW.getTime() - 30 * DAY_MS);

// All tests insert anomaly variants only; narrow the union for clean assertions.
const onlyAnomaly = (rows: readonly Alert[]): readonly AnomalyAlert[] =>
    rows.filter((r): r is AnomalyAlert => r.kind === "anomaly");

describe("listAlertsUseCase", () => {
    test("returns alerts newest first (raised_at desc)", async () => {
        const repo = new InMemoryAlertRepo();
        await repo.insert(alert({ raisedAt: new Date("2025-05-10T11:00:00Z"), reason: "older" }));
        await repo.insert(alert({ raisedAt: new Date("2025-05-10T11:55:00Z"), reason: "newer" }));
        await repo.insert(alert({ raisedAt: new Date("2025-05-10T11:30:00Z"), reason: "middle" }));

        const result = await listAlertsUseCase({
            workspaceId: WORKSPACE_A,
            from: since24h,
            alerts: repo,
        });

        expect(onlyAnomaly(result).map((a) => a.reason)).toEqual(["newer", "middle", "older"]);
    });

    test("from cutoff excludes alerts older than 24h before now", async () => {
        const repo = new InMemoryAlertRepo();
        await repo.insert(alert({ raisedAt: new Date("2025-05-10T00:00:01Z"), reason: "inside" }));
        await repo.insert(alert({ raisedAt: new Date("2025-05-09T11:00:00Z"), reason: "outside" }));

        const result = await listAlertsUseCase({
            workspaceId: WORKSPACE_A,
            from: since24h,
            alerts: repo,
        });

        expect(result.length).toBe(1);
        expect(onlyAnomaly(result)[0]?.reason).toBe("inside");
    });

    test("from cutoff at 7d boundary", async () => {
        const repo = new InMemoryAlertRepo();
        await repo.insert(alert({ raisedAt: new Date("2025-05-05T12:00:00Z"), reason: "5d-ago" }));
        await repo.insert(alert({ raisedAt: new Date("2025-05-02T11:00:00Z"), reason: "8d-ago" }));

        const result = await listAlertsUseCase({
            workspaceId: WORKSPACE_A,
            from: since7d,
            alerts: repo,
        });

        expect(onlyAnomaly(result).map((r) => r.reason)).toEqual(["5d-ago"]);
    });

    test("from cutoff at 30d boundary", async () => {
        const repo = new InMemoryAlertRepo();
        await repo.insert(alert({ raisedAt: new Date("2025-04-25T12:00:00Z"), reason: "15d-ago" }));
        await repo.insert(alert({ raisedAt: new Date("2025-04-09T11:00:00Z"), reason: "31d-ago" }));

        const result = await listAlertsUseCase({
            workspaceId: WORKSPACE_A,
            from: since30d,
            alerts: repo,
        });

        expect(onlyAnomaly(result).map((r) => r.reason)).toEqual(["15d-ago"]);
    });

    test("to bound excludes alerts at or after the upper end", async () => {
        const repo = new InMemoryAlertRepo();
        await repo.insert(alert({ raisedAt: new Date("2025-05-08T12:00:00Z"), reason: "inside" }));
        await repo.insert(alert({ raisedAt: new Date("2025-05-10T11:30:00Z"), reason: "after" }));

        const result = await listAlertsUseCase({
            workspaceId: WORKSPACE_A,
            from: since7d,
            to: new Date("2025-05-09T00:00:00Z"),
            alerts: repo,
        });

        expect(onlyAnomaly(result).map((r) => r.reason)).toEqual(["inside"]);
    });

    test("limit caps result set", async () => {
        const repo = new InMemoryAlertRepo();
        for (let i = 0; i < 5; i += 1) {
            await repo.insert(
                alert({ raisedAt: new Date(NOW.getTime() - i * 60_000), reason: `r${i}` }),
            );
        }

        const result = await listAlertsUseCase({
            workspaceId: WORKSPACE_A,
            from: since24h,
            limit: 2,
            alerts: repo,
        });

        expect(result.length).toBe(2);
    });

    test("default limit is 100", async () => {
        const repo = new InMemoryAlertRepo();
        for (let i = 0; i < 150; i += 1) {
            await repo.insert(
                alert({ raisedAt: new Date(NOW.getTime() - i * 1000), reason: `r${i}` }),
            );
        }

        const result = await listAlertsUseCase({
            workspaceId: WORKSPACE_A,
            from: since24h,
            alerts: repo,
        });

        expect(result.length).toBe(100);
    });

    test("workspace isolation: alerts from another workspace are excluded", async () => {
        const repo = new InMemoryAlertRepo();
        await repo.insert(
            alert({
                scope: { workspaceId: WORKSPACE_A, tenantId: null, agentId: null },
                reason: "ours",
            }),
        );
        await repo.insert(
            alert({
                scope: { workspaceId: WORKSPACE_B, tenantId: null, agentId: null },
                reason: "theirs",
            }),
        );

        const result = await listAlertsUseCase({
            workspaceId: WORKSPACE_A,
            from: since24h,
            alerts: repo,
        });

        expect(result.length).toBe(1);
        expect(onlyAnomaly(result)[0]?.reason).toBe("ours");
    });

    test("tenantId filter narrows to alerts whose tenant scope matches", async () => {
        const repo = new InMemoryAlertRepo();
        await repo.insert(
            alert({
                scope: { workspaceId: WORKSPACE_A, tenantId: "tenant-a", agentId: null },
                reason: "ta",
            }),
        );
        await repo.insert(
            alert({
                scope: { workspaceId: WORKSPACE_A, tenantId: "tenant-b", agentId: null },
                reason: "tb",
            }),
        );
        await repo.insert(
            alert({
                scope: { workspaceId: WORKSPACE_A, tenantId: null, agentId: "agent-x" },
                reason: "ax",
            }),
        );

        const result = await listAlertsUseCase({
            workspaceId: WORKSPACE_A,
            tenantId: ["tenant-a"],
            from: since24h,
            alerts: repo,
        });

        expect(result.length).toBe(1);
        expect(onlyAnomaly(result)[0]?.reason).toBe("ta");
    });

    test("agentId filter narrows to alerts whose agent scope matches", async () => {
        const repo = new InMemoryAlertRepo();
        await repo.insert(
            alert({
                scope: { workspaceId: WORKSPACE_A, tenantId: null, agentId: "agent-x" },
                reason: "ax",
            }),
        );
        await repo.insert(
            alert({
                scope: { workspaceId: WORKSPACE_A, tenantId: null, agentId: "agent-y" },
                reason: "ay",
            }),
        );
        await repo.insert(
            alert({
                scope: { workspaceId: WORKSPACE_A, tenantId: "tenant-a", agentId: null },
                reason: "ta",
            }),
        );

        const result = await listAlertsUseCase({
            workspaceId: WORKSPACE_A,
            agentId: ["agent-x"],
            from: since24h,
            alerts: repo,
        });

        expect(result.length).toBe(1);
        expect(onlyAnomaly(result)[0]?.reason).toBe("ax");
    });

    test("empty result returned when no alerts match", async () => {
        const repo = new InMemoryAlertRepo();

        const result = await listAlertsUseCase({
            workspaceId: WORKSPACE_A,
            from: since24h,
            alerts: repo,
        });

        expect(result).toEqual([]);
    });
});
