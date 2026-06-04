import type { MemberRepository } from "./member.repository";

export interface RemoveMemberInput {
    readonly workspaceId: string;
    readonly userId: string;
    readonly members: MemberRepository;
}

/**
 * Removes a member from a workspace. Refuses to remove the last owner — every
 * workspace must keep at least one owner so it never becomes unmanageable (or,
 * on cloud, un-billable).
 */
export async function removeMemberUseCase(input: RemoveMemberInput): Promise<void> {
    const membership = await input.members.findMembership(input.workspaceId, input.userId);
    if (!membership) {
        throw new Error("not a member of this workspace");
    }
    if (membership.role === "owner") {
        const owners = await input.members.countOwners(input.workspaceId);
        if (owners <= 1) {
            throw new Error("cannot remove the workspace's last owner");
        }
    }
    await input.members.removeMember(input.workspaceId, input.userId);
}
