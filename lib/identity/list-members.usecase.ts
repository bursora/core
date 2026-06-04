import type { MemberRole } from "./member";
import type { MemberRepository } from "./member.repository";
import type { UserStatus } from "./user-status";

export interface MemberListItem {
    readonly workspaceId: string;
    readonly userId: string;
    readonly email: string;
    readonly image: string | null;
    readonly role: MemberRole;
    readonly status: UserStatus;
    readonly createdAt: Date;
}

export interface ListMembersInput {
    readonly workspaceId: string;
    readonly members: MemberRepository;
}

/**
 * Lists members of a workspace with their email and role. Caller MUST pass
 * a workspace id derived from the authenticated session.
 */
export async function listMembersUseCase(
    input: ListMembersInput,
): Promise<readonly MemberListItem[]> {
    const rows = await input.members.listByWorkspace(input.workspaceId);
    return rows.map((row) => ({
        workspaceId: row.workspaceId,
        userId: row.userId,
        email: row.email,
        image: row.image,
        role: row.role,
        status: row.status,
        createdAt: row.createdAt,
    }));
}
