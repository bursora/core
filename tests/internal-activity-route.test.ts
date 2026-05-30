/**
 * Integration-style tests for GET /api/internal/workspace/[workspaceId]/activity.
 *
 * Behaviors covered:
 *   - 401 when no session
 *   - 403 when session user is not a member of workspaceId
 *   - 200 with { activity: [...] } when authenticated member
 *
 * Auth and membership are mocked via `mock.module`. Activity fetch is wired
 * through the existing `setActivityDepsForTesting` hook.
 */

import { setBillingGateDepsForTesting } from "@/lib/billing-gate/server";
import { setActivityDepsForTesting } from "@/lib/compose/activity";
import type { AnomalyAlert } from "@/lib/detection";
import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WORKSPACE = "11111111-2222-3333-4444-555555555555";

interface AuthState {
    session: { user: { id: string } } | null;
    memberOf: Set<string>;
}

const state: AuthState = {
    session: null,
    memberOf: new Set(),
};

let realAuth: Record<string, unknown>;
let realIdentity: Record<string, unknown>;
let realHeaders: Record<string, unknown>;

beforeAll(async () => {
    // Snapshot the real exports BEFORE mocking. `await import` returns a live
    // namespace object that mock.module mutates in place, so spread into a plain
    // object to freeze the real values for restoration in afterAll.
    realAuth = { ...(await import("@/lib/auth")) };
    realIdentity = { ...(await import("@/lib/identity/server")) };
    realHeaders = { ...(await import("next/headers")) };
    mock.module("@/lib/auth", () => ({
        auth: {
            api: {
                getSession: async () => state.session,
            },
        },
        getRequestSession: async () => state.session,
        requireSessionUI: async () => state.session,
    }));
    mock.module("@/lib/identity/server", () => ({
        ...realIdentity,
        assertWorkspaceMember: async (input: { workspaceId: string; userId: string }) => {
            if (!state.memberOf.has(`${input.userId}:${input.workspaceId}`)) {
                throw new Error("not a member of this workspace");
            }
            return { workspaceId: input.workspaceId, userId: input.userId, role: "member" };
        },
    }));
    mock.module("next/headers", () => ({
        headers: async () => new Headers(),
    }));
});

// mock.module is process-global; restore the hijacked specifiers at file end so
// the @/lib/auth stub (which lacks `.options`) can't leak into later files that
// read the real auth — e.g. the user-role schema test asserting
// auth.options.user. mock.restore() does not reliably revert mock.module once
// the route under test has imported it, so re-point at the real snapshots.
afterAll(() => {
    mock.module("@/lib/auth", () => realAuth);
    mock.module("@/lib/identity/server", () => realIdentity);
    mock.module("next/headers", () => realHeaders);
});

const setupActivity = () => {
    setActivityDepsForTesting({
        fetchEventBuckets: async () => [{ at: new Date("2025-05-10T11:00:00Z"), count: 7 }],
        fetchAlerts: async (): Promise<readonly AnomalyAlert[]> => [],
        fetchKeyEvents: async () => [],
    });
    // These tests exercise activity behavior, not the paywall: force the
    // workspace UNLOCKED so the cloud gate doesn't 403. The ambient dev env may
    // have IS_CLOUD=true, so pin it deterministically. The locked path has its
    // own test below.
    setBillingGateDepsForTesting({ isCloud: false, readBilling: async () => null });
};

const teardown = () => {
    setActivityDepsForTesting(null);
    setBillingGateDepsForTesting(null);
    state.session = null;
    state.memberOf.clear();
};

const makeRequest = (workspaceId: string): Request =>
    new Request(`http://localhost/api/internal/workspace/${workspaceId}/activity`, {
        method: "GET",
    });

const callRoute = async (workspaceId: string) => {
    const { GET } = await import("@/app/api/internal/workspace/[workspaceId]/activity/route");
    return GET(makeRequest(workspaceId), {
        params: Promise.resolve({ workspaceId }),
    });
};

describe("GET /api/internal/workspace/[workspaceId]/activity", () => {
    afterEach(() => teardown());

    test("401 when no session", async () => {
        setupActivity();
        state.session = null;
        const res = await callRoute(WORKSPACE);
        expect(res.status).toBe(401);
    });

    test("403 when authenticated user is not a workspace member", async () => {
        setupActivity();
        state.session = { user: { id: USER_ID } };
        // Note: memberOf is empty, so assertWorkspaceMember throws
        const res = await callRoute(WORKSPACE);
        expect(res.status).toBe(403);
    });

    test("200 returns activity for a workspace member", async () => {
        setupActivity();
        state.session = { user: { id: USER_ID } };
        state.memberOf.add(`${USER_ID}:${WORKSPACE}`);
        const res = await callRoute(WORKSPACE);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { activity: { kind: string }[] };
        expect(Array.isArray(body.activity)).toBe(true);
        expect(body.activity.map((i) => i.kind)).toContain("event_ingested");
    });

    test("403 when the cloud workspace is locked (no active subscription)", async () => {
        setupActivity();
        // Override: cloud + no billing record → locked. Activity is gated data.
        setBillingGateDepsForTesting({ isCloud: true, readBilling: async () => null });
        state.session = { user: { id: USER_ID } };
        state.memberOf.add(`${USER_ID}:${WORKSPACE}`);
        const res = await callRoute(WORKSPACE);
        expect(res.status).toBe(403);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toBe("subscription_required");
    });
});
