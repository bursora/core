import type { WorkspaceMember } from "./member";
import type { InviteRepository, MemberRepository } from "./member.repository";

export interface AcceptInviteInput {
    readonly token: string;
    readonly userId: string;
    readonly invites: InviteRepository;
    readonly members: MemberRepository;
}

export interface AcceptInviteResult {
    readonly membership: WorkspaceMember;
    readonly workspaceId: string;
}

export async function acceptInviteUseCase(input: AcceptInviteInput): Promise<AcceptInviteResult> {
    const invite = await input.invites.findByToken(input.token);
    if (!invite) {
        throw new Error("invite not found");
    }
    if (invite.acceptedAt !== null) {
        throw new Error("invite already accepted");
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
        throw new Error("invite expired");
    }

    const now = new Date();
    const membership = await input.members.addMember({
        workspaceId: invite.workspaceId,
        userId: input.userId,
        role: invite.role,
    });
    await input.invites.markAccepted(invite.token, now);

    return { membership, workspaceId: invite.workspaceId };
}
