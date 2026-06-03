/**
 * Tests for filter + pagination behavior of
 * GET /api/internal/workspace/[workspaceId]/activity.
 *
 * Without filter params the route must keep its legacy `{ activity: [...] }`
 * shape. With any filter param it returns `{ items, nextCursor }`.
 */

import { setBillingGateDepsForTesting } from "@/lib/billing-gate/server";
import { setActivityDepsForTesting } from "@/lib/compose/activity";
import type { AnomalyAlert } from "@/lib/detection";
import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WORKSPACE = "11111111-2222-3333-4444-555555555555";

let realAuth: Record<string, unknown>;
let realIdentity: Record<string, unknown>;
let realHeaders: Record<string, unknown>;

beforeAll(async () => {
    // Snapshot real exports BEFORE mocking. `await import` returns a live
    // namespace object that mock.module mutates in place, so spread into a
    // plain object to freeze the real values for restoration in afterAll.
    realAuth = { ...(await import("@/lib/auth")) };
    realIdentity = { ...(await import("@/lib/identity/server")) };
    realHeaders = { ...(await import("next/headers")) };
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

// mock.module is process-global; restore at file end so the @/lib/auth stub
// doesn't leak into later files that import the real auth (e.g. the user-role
// schema test reading auth.options).
afterAll(() => {
    mock.module("@/lib/auth", () => realAuth);
    mock.module("@/lib/identity/server", () => realIdentity);
    mock.module("next/headers", () => realHeaders);
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
    // Exercise activity behavior, not the paywall — pin the workspace UNLOCKED
    // (ambient dev env may be IS_CLOUD=true). Locked path tested separately.
    setBillingGateDepsForTesting({ isCloud: false, readBilling: async () => null });
};

const callRoute = async (qs: string) => {
    const { GET } = await import("@/app/api/internal/workspace/[workspaceId]/activity/route");
    const req = new Request(`http://localhost/api/internal/workspace/${WORKSPACE}/activity${qs}`);
    return GET(req, { params: Promise.resolve({ workspaceId: WORKSPACE }) });
};

describe("GET /api/internal/workspace/.../activity (filtered)", () => {
    afterEach(() => {
        setActivityDepsForTesting(null);
        setBillingGateDepsForTesting(null);
    });

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

    test("rejects oversized cursor with 400", async () => {
        setupActivity();
        const huge = "1".repeat(501);
        const res = await callRoute(`?cursor=${huge}`);
        expect(res.status).toBe(400);
    });

    test("rejects malformed cursor with 400", async () => {
        setupActivity();
        const res = await callRoute("?cursor=not-a-number");
        expect(res.status).toBe(400);
    });

    test("accepts valid numeric cursor", async () => {
        setupActivity();
        const res = await callRoute("?cursor=1700000000000");
        expect(res.status).toBe(200);
        const body = (await res.json()) as { items?: unknown; nextCursor?: unknown };
        expect(Array.isArray(body.items)).toBe(true);
    });

    test("from/to bounds drop items outside the explicit range", async () => {
        setupActivity();
        // Seeded items span 2025-05-10 10:00–11:30Z. Bound to 11:00–11:15Z so
        // only the 11:00 event bucket survives; the alert (11:30) and 10:00
        // bucket fall outside.
        const res = await callRoute("?from=2025-05-10T11:00:00.000Z&to=2025-05-10T11:15:00.000Z");
        expect(res.status).toBe(200);
        const body = (await res.json()) as { items: { kind: string; count?: number }[] };
        expect(body.items).toHaveLength(1);
        expect(body.items[0]?.kind).toBe("event_ingested");
    });

    test("explicit from/to override range", async () => {
        setupActivity();
        // range=24h would start ~now (2026), excluding all 2025 items. Explicit
        // from/to must win and surface the seeded 2025 rows.
        const res = await callRoute(
            "?range=24h&from=2025-05-10T09:00:00.000Z&to=2025-05-10T12:00:00.000Z",
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { items: unknown[] };
        expect(body.items.length).toBeGreaterThan(0);
    });

    test("rejects non-ISO from with 400", async () => {
        setupActivity();
        const res = await callRoute("?from=2025-05-10");
        expect(res.status).toBe(400);
    });

    test("403 with subscription_required when the cloud workspace is locked", async () => {
        setupActivity();
        setBillingGateDepsForTesting({ isCloud: true, readBilling: async () => null });
        const res = await callRoute("?kind=alert_raised");
        expect(res.status).toBe(403);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toBe("subscription_required");
    });
});
