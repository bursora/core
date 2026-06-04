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
     * Returns the platform role (`admin` | `user`) of the workspace owner —
     * the `users.role` of the member whose workspace role is `owner` — or
     * `null` when the workspace has no owner row. Drives the admin-owned
     * workspace exemptions (rate limit, fair-use cap).
     */
    findOwnerUserRole(workspaceId: string): Promise<UserRole | null>;

    /**
     * Returns the `user_id` of the workspace owner (the member whose workspace
     * role is `owner`) or `null` when the workspace has no owner row. Used by
     * the cloud billing gate to resolve whose subscription gates the workspace.
     * Resolves to a single stable owner with the same ordering as
     * `findOwnerUserRole`.
     */
    findOwnerUserId(workspaceId: string): Promise<string | null>;
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
