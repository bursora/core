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

    markAccepted(token: string, acceptedAt: Date): Promise<void>;

    listPendingByWorkspace(workspaceId: string): Promise<readonly Invite[]>;

    deletePending(input: { workspaceId: string; email: string }): Promise<number>;
}
