import type { WorkspaceMember } from "./member";
import type { InviteRepository, MemberRepository } from "./member.repository";

export interface AcceptInviteInput {
    readonly token: string;
    readonly userId: string;
    readonly email: string;
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
    // Bind acceptance to the invited address: the token alone must not let any
    // signed-in account join. Invite email is lowercased at creation; normalize
    // both sides defensively.
    if (invite.email.toLowerCase() !== input.email.trim().toLowerCase()) {
        throw new Error("this invite was sent to a different email");
    }

    // Atomic claim: a single UPDATE with WHERE accepted_at IS NULL. Without
    // this, two concurrent accepts both see acceptedAt === null above and
    // race past the check.
    const claimed = await input.invites.claim(invite.token, new Date());
    if (!claimed) {
        throw new Error("invite already accepted");
    }

    const membership = await input.members.addMember({
        workspaceId: claimed.workspaceId,
        userId: input.userId,
        role: claimed.role,
    });

    return { membership, workspaceId: claimed.workspaceId };
}
