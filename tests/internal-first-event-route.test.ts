/**
 * Integration-style tests for GET /api/internal/workspace/[workspaceId]/first-event.
 *
 * Behaviors covered:
 *   - 401 when no session
 *   - 403 when session user is not a member of workspaceId
 *   - 200 { received: false } when the workspace has no usage events
 *   - 200 { received: true } once at least one event has landed
 *
 * Auth and membership are mocked via `mock.module`, matching the sibling
 * activity-route test. The event count is stubbed on `@/lib/metering/server`.
 */

import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WORKSPACE = "11111111-2222-3333-4444-555555555555";

interface PollState {
    session: { user: { id: string } } | null;
    memberOf: Set<string>;
    count: number;
}

const state: PollState = {
    session: null,
    memberOf: new Set(),
    count: 0,
};

let realAuth: Record<string, unknown>;
let realIdentity: Record<string, unknown>;
let realMetering: Record<string, unknown>;
let realHeaders: Record<string, unknown>;

beforeAll(async () => {
    realAuth = { ...(await import("@/lib/auth")) };
    realIdentity = { ...(await import("@/lib/identity/server")) };
    realMetering = { ...(await import("@/lib/metering/server")) };
    realHeaders = { ...(await import("next/headers")) };
    mock.module("@/lib/auth", () => ({
        getRequestSession: async () => state.session,
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
    mock.module("@/lib/metering/server", () => ({
        ...realMetering,
        countEventsForWorkspace: async () => state.count,
    }));
    mock.module("next/headers", () => ({
        headers: async () => new Headers(),
    }));
});

afterAll(() => {
    mock.module("@/lib/auth", () => realAuth);
    mock.module("@/lib/identity/server", () => realIdentity);
    mock.module("@/lib/metering/server", () => realMetering);
    mock.module("next/headers", () => realHeaders);
});

const teardown = () => {
    state.session = null;
    state.memberOf.clear();
    state.count = 0;
};

const callRoute = async (workspaceId: string) => {
    const { GET } = await import("@/app/api/internal/workspace/[workspaceId]/first-event/route");
    const request = new Request(
        `http://localhost/api/internal/workspace/${workspaceId}/first-event`,
        { method: "GET" },
    );
    return GET(request, { params: Promise.resolve({ workspaceId }) });
};

describe("GET /api/internal/workspace/[workspaceId]/first-event", () => {
    afterEach(() => teardown());

    test("401 when no session", async () => {
        state.session = null;
        const res = await callRoute(WORKSPACE);
        expect(res.status).toBe(401);
    });

    test("403 when authenticated user is not a workspace member", async () => {
        state.session = { user: { id: USER_ID } };
        const res = await callRoute(WORKSPACE);
        expect(res.status).toBe(403);
    });

    test("200 { received: false } when the workspace has no events", async () => {
        state.session = { user: { id: USER_ID } };
        state.memberOf.add(`${USER_ID}:${WORKSPACE}`);
        state.count = 0;
        const res = await callRoute(WORKSPACE);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { received: boolean };
        expect(body.received).toBe(false);
    });

    test("200 { received: true } once an event has landed", async () => {
        state.session = { user: { id: USER_ID } };
        state.memberOf.add(`${USER_ID}:${WORKSPACE}`);
        state.count = 1;
        const res = await callRoute(WORKSPACE);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { received: boolean };
        expect(body.received).toBe(true);
    });
});
