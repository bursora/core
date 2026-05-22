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

import { setActivityDepsForTesting } from "@/lib/compose/activity";
import type { AnomalyAlert } from "@/lib/detection";
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

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

beforeAll(async () => {
    const realIdentity = (await import("@/lib/identity/server")) as Record<string, unknown>;
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

const setupActivity = () => {
    setActivityDepsForTesting({
        fetchEventBuckets: async () => [{ at: new Date("2025-05-10T11:00:00Z"), count: 7 }],
        fetchAlerts: async (): Promise<readonly AnomalyAlert[]> => [],
        fetchKeyEvents: async () => [],
    });
};

const teardown = () => {
    setActivityDepsForTesting(null);
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
});
