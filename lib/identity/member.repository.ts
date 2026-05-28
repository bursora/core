import type { Invite, MemberRole, WorkspaceMember } from "./member";

export interface MemberListRow {
    readonly workspaceId: string;
    readonly userId: string;
    readonly email: string;
    readonly role: MemberRole;
    readonly createdAt: Date;
}

export interface MemberRepository {
    addMember(input: {
        workspaceId: string;
        userId: string;
        role: MemberRole;
    }): Promise<WorkspaceMember>;

    findMembership(workspaceId: string, userId: string): Promise<WorkspaceMember | null>;

    listByWorkspace(workspaceId: string): Promise<readonly MemberListRow[]>;

    /**
     * Returns just the `user_id` column for every member of the workspace.
     * Fan-out paths (alert/setup-error → notifications) read this on every
     * event; the trimmed projection avoids the user-table join + extra
     * columns that `listByWorkspace` carries.
     */
    listMemberUserIds(workspaceId: string): Promise<readonly string[]>;
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
