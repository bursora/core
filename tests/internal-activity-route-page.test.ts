/**
 * Tests for filter + pagination behavior of
 * GET /api/internal/workspace/[workspaceId]/activity.
 *
 * Without filter params the route must keep its legacy `{ activity: [...] }`
 * shape. With any filter param it returns `{ items, nextCursor }`.
 */

import { setActivityDepsForTesting } from "@/lib/compose/activity";
import type { AnomalyAlert } from "@/lib/detection";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WORKSPACE = "11111111-2222-3333-4444-555555555555";

beforeAll(async () => {
    const realIdentity = (await import("@/lib/identity/server")) as Record<string, unknown>;
    mock.module("@/lib/auth", () => ({
        auth: { api: { getSession: async () => ({ user: { id: USER_ID } }) } },
        getRequestSession: async () => ({ user: { id: USER_ID } }),
        requireSessionUI: async () => ({ user: { id: USER_ID } }),
    }));
    mock.module("@/lib/identity/server", () => ({
        ...realIdentity,
        assertWorkspaceMember: async () => ({
            workspaceId: WORKSPACE,
            userId: USER_ID,
            role: "member",
        }),
    }));
    mock.module("next/headers", () => ({
        headers: async () => new Headers(),
    }));
});

const setupActivity = () => {
    setActivityDepsForTesting({
        fetchEventBuckets: async () => [
            { at: new Date("2025-05-10T11:00:00Z"), count: 7 },
            { at: new Date("2025-05-10T10:00:00Z"), count: 3 },
        ],
        fetchAlerts: async (): Promise<readonly AnomalyAlert[]> => {
            const raisedAt = new Date("2025-05-10T11:30:00Z");
            return [
                {
                    kind: "anomaly",
                    scope: { workspaceId: WORKSPACE, tenantId: null, agentId: null },
                    reason: "spike",
                    deviation: 4,
                    severity: "critical",
                    raisedAt,
                    windowStart: raisedAt,
                    windowEnd: new Date(raisedAt.getTime() + 5 * 60_000),
                    windowCostUsd: 0.42,
                },
            ];
        },
        fetchKeyEvents: async () => [],
    });
};

const callRoute = async (qs: string) => {
    const { GET } = await import("@/app/api/internal/workspace/[workspaceId]/activity/route");
    const req = new Request(`http://localhost/api/internal/workspace/${WORKSPACE}/activity${qs}`);
    return GET(req, { params: Promise.resolve({ workspaceId: WORKSPACE }) });
};

describe("GET /api/internal/workspace/.../activity (filtered)", () => {
    afterEach(() => setActivityDepsForTesting(null));

    test("legacy shape when no filter params supplied", async () => {
        setupActivity();
        const res = await callRoute("");
        expect(res.status).toBe(200);
        const body = (await res.json()) as { activity?: unknown; items?: unknown };
        expect(body.activity).toBeDefined();
        expect(body.items).toBeUndefined();
    });

    test("returns { items, nextCursor } shape when kind filter supplied", async () => {
        setupActivity();
        const res = await callRoute("?kind=alert_raised");
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            items: { kind: string }[];
            nextCursor: string | null;
        };
        expect(Array.isArray(body.items)).toBe(true);
        expect(body.items.every((i) => i.kind === "alert_raised")).toBe(true);
        expect(body.nextCursor).toBeDefined();
    });

    test("rejects invalid kind with 400", async () => {
        setupActivity();
        const res = await callRoute("?kind=bogus");
        expect(res.status).toBe(400);
    });
});
