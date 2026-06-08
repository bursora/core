import type { Invite, MemberRole, WorkspaceMember } from "./member";
import type { UserRole } from "./user-role";
import type { UserStatus } from "./user-status";

export interface MemberListRow {
    readonly workspaceId: string;
    readonly userId: string;
    readonly email: string;
    readonly image: string | null;
    readonly role: MemberRole;
    /** Account lifecycle — `pending_deletion` members are suspended and purge soon. */
    readonly status: UserStatus;
    readonly createdAt: Date;
}

/**
 * The single deterministic owner of a workspace: the member whose workspace
 * role is `owner`, resolved admin-first then by a stable order. Carries both
 * the user id (for the cloud billing read) and the platform role (for the
 * admin-owned bypass) so one query feeds both.
 */
export interface WorkspaceOwner {
    readonly userId: string;
    readonly role: UserRole;
}

export interface MemberRepository {
    addMember(input: {
        workspaceId: string;
        userId: string;
        role: MemberRole;
    }): Promise<WorkspaceMember>;

    findMembership(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;

    /** Deletes the membership row for (workspaceId, userId). No-op if absent. */
    removeMember(workspaceId: string, userId: string): Promise<void>;

    /** Sets the workspace role for (workspaceId, userId). */
    updateRole(workspaceId: string, userId: string, role: MemberRole): Promise<void>;

    /**
     * Counts members whose workspace role is `owner`. Drives the last-owner
     * invariant on member removal and role demotion.
     */
    countOwners(workspaceId: string): Promise<number>;

    /** Workspace ids the user is a member of. Drives account-deletion planning. */
    listWorkspaceIdsForUser(userId: string): Promise<readonly string[]>;

    listByWorkspace(workspaceId: string): Promise<readonly MemberListRow[]>;

    /**
     * Returns just the `user_id` column for every member of the workspace.
     * Fan-out paths (alert/setup-error → notifications) read this on every
     * event; the trimmed projection avoids the user-table join + extra
     * columns that `listByWorkspace` carries.
     */
    listMemberUserIds(workspaceId: string): Promise<readonly string[]>;

    /**
     * Resolves the workspace owner once, returning the deterministic owner's
     * user id and platform role together, or `null` when the workspace has no
     * owner row. A workspace may have multiple owners; an admin owner wins,
     * then the oldest, then the lowest id, so the resolved owner never flips
     * between calls. Feeds both the admin-owned bypass (rate limit, fair-use
     * cap) and the cloud billing gate from a single query.
     */
    findOwner(workspaceId: string): Promise<WorkspaceOwner | null>;
}

export interface InviteRepository {
    create(input: {
        token: string;
        workspaceId: string;
        email: string;
        invitedBy: string;
        role: MemberRole;
        expiresAt: Date;
    }): Promise<Invite>;

    findByToken(token: string): Promise<Invite | null>;

    /**
     * Atomic compare-and-swap: set `acceptedAt` to the given value only when
     * the row is currently unaccepted. Returns the row on success, `null` if
     * the invite is missing or already accepted. This is the single-use
     * guarantee for invite redemption; concurrent callers cannot both win.
     */
    claim(token: string, acceptedAt: Date): Promise<Invite | null>;

    listPendingByWorkspace(workspaceId: string): Promise<readonly Invite[]>;

    /**
     * Counts rows where `workspace_id = ?` AND `accepted_at IS NULL`. Used
     * by the cap check in `inviteMemberUseCase` to reject new invites once
     * the workspace hits `MAX_PENDING_INVITES_PER_WORKSPACE`.
     */
    countPendingByWorkspace(workspaceId: string): Promise<number>;

    deletePending(input: { workspaceId: string; email: string }): Promise<number>;
}
