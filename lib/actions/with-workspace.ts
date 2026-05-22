/**
 * Wraps a server action so session + workspace membership are verified before
 * the handler runs. The layout-level guard does not cover action POSTs, so
 * each action must re-check on its own; this wrapper keeps that consistent.
 */

import { getRequestSession, type Session } from "@/lib/auth";
import type { WorkspaceMember } from "../identity/member";
import { findMembership } from "../identity/server";
import { redirect } from "next/navigation";

export interface SessionCtx {
    session: Session;
}

export interface WorkspaceCtx {
    session: Session;
    membership: WorkspaceMember;
}

export interface WithWorkspaceDeps {
    getSession: () => Promise<Session | null>;
    findMembership: (workspaceId: string, userId: string) => Promise<WorkspaceMember | null>;
}

export interface WithWorkspaceOptions<Args extends unknown[]> {
    getWorkspaceId: (...args: Args) => string;
    deps?: WithWorkspaceDeps;
}

const defaultDeps: WithWorkspaceDeps = {
    getSession: async () => (await getRequestSession()) as Session | null,
    // Use the per-request memoised lookup directly. DB/infra errors propagate;
    // a `null` result means "not a member" and triggers the canonical throw below.
    findMembership: (workspaceId, userId) => findMembership(workspaceId, userId),
};

export function withWorkspace<Args extends unknown[], R>(
    handler: (ctx: WorkspaceCtx, ...args: Args) => Promise<R>,
    options: WithWorkspaceOptions<Args>,
): (...args: Args) => Promise<R> {
    const deps = options.deps ?? defaultDeps;
    return async (...args: Args) => {
        const session = await deps.getSession();
        if (!session) redirect("/login");

        const workspaceId = options.getWorkspaceId(...args);
        const membership = await deps.findMembership(workspaceId, session.user.id);
        if (!membership) {
            // Match the exact error `assertWorkspaceMember` throws so callers that
            // catch it (or check `err.message`) keep working.
            throw new Error("not a member of this workspace");
        }

        return handler({ session, membership }, ...args);
    };
}
