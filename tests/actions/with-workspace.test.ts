/**
 * Tests for the `withWorkspace` server-action wrapper. Composes session +
 * workspace membership and passes a typed ctx to the handler.
 */

import { withWorkspace, type SessionCtx, type WorkspaceCtx } from "@/lib/actions/with-workspace";
import { describe, expect, mock, test } from "bun:test";

const fakeSession = {
    user: { id: "u1", email: "a@b.c" },
    session: { id: "s1" },
} as unknown as SessionCtx["session"];

const fakeMembership = {
    workspaceId: "w1",
    userId: "u1",
    role: "owner",
} as unknown as WorkspaceCtx["membership"];

describe("withWorkspace", () => {
    test("rejects when no session", async () => {
        const getSession = mock(async () => null);
        const findMembership = mock(async () => fakeMembership);
        const handler = mock(async (_ctx: WorkspaceCtx) => "ok");
        const wrapped = withWorkspace(handler, {
            getWorkspaceId: () => "w1",
            deps: { getSession, findMembership },
        });

        await expect(wrapped()).rejects.toBeDefined();
        expect(handler).not.toHaveBeenCalled();
        expect(findMembership).not.toHaveBeenCalled();
    });

    test("rejects when authenticated but not a member", async () => {
        const getSession = mock(async () => fakeSession);
        const findMembership = mock(async () => null);
        const handler = mock(async (_ctx: WorkspaceCtx) => "ok");
        const wrapped = withWorkspace(handler, {
            getWorkspaceId: () => "w1",
            deps: { getSession, findMembership },
        });

        await expect(wrapped()).rejects.toThrow();
        expect(handler).not.toHaveBeenCalled();
    });

    test("invokes handler with full ctx on valid membership", async () => {
        const getSession = mock(async () => fakeSession);
        const findMembership = mock(async () => fakeMembership);
        const handler = mock(async (ctx: WorkspaceCtx) => ctx.membership.role);
        const wrapped = withWorkspace(handler, {
            getWorkspaceId: () => "w1",
            deps: { getSession, findMembership },
        });

        expect(await wrapped()).toBe("owner");
        expect(findMembership).toHaveBeenCalledWith("w1", "u1");
    });

    test("propagates handler errors as-is", async () => {
        const getSession = mock(async () => fakeSession);
        const findMembership = mock(async () => fakeMembership);
        const boom = new Error("kaboom");
        const wrapped = withWorkspace(
            async () => {
                throw boom;
            },
            {
                getWorkspaceId: () => "w1",
                deps: { getSession, findMembership },
            },
        );

        await expect(wrapped()).rejects.toBe(boom);
    });

    test("getWorkspaceId receives the original arguments", async () => {
        const getSession = mock(async () => fakeSession);
        const findMembership = mock(async () => fakeMembership);
        const wrapped = withWorkspace(
            async (ctx: WorkspaceCtx, _form: { workspaceId: string }) => ctx.membership.workspaceId,
            {
                getWorkspaceId: (form: { workspaceId: string }) => form.workspaceId,
                deps: { getSession, findMembership },
            },
        );

        expect(await wrapped({ workspaceId: "w1" })).toBe("w1");
    });
});
