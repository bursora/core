import type { MemberRole } from "./member";
import type { MemberRepository } from "./member.repository";

export interface MemberListItem {
    readonly workspaceId: string;
    readonly userId: string;
    readonly email: string;
    readonly role: MemberRole;
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
        role: row.role,
        createdAt: row.createdAt,
    }));
}
