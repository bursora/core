/**
 * Workspace membership.
 *
 * A user joins a workspace through a `WorkspaceMember` row. Roles are
 * coarse — owner can do anything, member can read and emit events. Invites
 * sit in a separate aggregate (`Invite`) until accepted.
 */

export type MemberRole = "owner" | "member";

export interface WorkspaceMember {
    readonly workspaceId: string;
    readonly userId: string;
    readonly role: MemberRole;
    readonly createdAt: Date;
}

export interface Invite {
    readonly token: string;
    readonly workspaceId: string;
    readonly email: string;
    readonly invitedBy: string;
    readonly role: MemberRole;
    readonly createdAt: Date;
    readonly acceptedAt: Date | null;
    readonly expiresAt: Date;
}
