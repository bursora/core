import type { MemberRole } from "./member";
import type { MemberRepository } from "./member.repository";

export interface ChangeMemberRoleInput {
    readonly workspaceId: string;
    readonly userId: string;
    readonly role: MemberRole;
    readonly members: MemberRepository;
}

/**
 * Changes a member's workspace role. Promoting a member to owner is how
 * ownership transfers before the prior owner leaves or deletes their account.
 * Refuses to demote the last owner so a workspace always keeps one.
 */
export async function changeMemberRoleUseCase(input: ChangeMemberRoleInput): Promise<void> {
    const membership = await input.members.findMembership(input.workspaceId, input.userId);
    if (!membership) {
        throw new Error("not a member of this workspace");
    }
    if (membership.role === input.role) return;
    if (membership.role === "owner" && input.role === "member") {
        const owners = await input.members.countOwners(input.workspaceId);
        if (owners <= 1) {
            throw new Error("workspace must keep at least one owner");
        }
    }
    await input.members.updateRole(input.workspaceId, input.userId, input.role);
}
