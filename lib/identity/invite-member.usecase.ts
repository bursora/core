import { randomBytes } from "node:crypto";
import { sendInviteEmail, type Mailer } from "../notification";
import { InviteCapExceededError, MAX_PENDING_INVITES_PER_WORKSPACE } from "./invite-cap";
import type { Invite, MemberRole } from "./member";
import type { InviteRepository } from "./member.repository";

export interface InviteMemberInput {
    readonly workspaceId: string;
    readonly email: string;
    readonly invitedBy: string;
    readonly role: MemberRole;
    readonly invites: InviteRepository;
    readonly mailer: Mailer;
    readonly acceptUrl: (token: string) => string;
    readonly ttlMs?: number;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function inviteMemberUseCase(input: InviteMemberInput): Promise<Invite> {
    const email = input.email.trim().toLowerCase();
    if (!email.includes("@")) {
        throw new Error("invalid email");
    }

    const pending = await input.invites.countPendingByWorkspace(input.workspaceId);
    if (pending >= MAX_PENDING_INVITES_PER_WORKSPACE) {
        throw new InviteCapExceededError(input.workspaceId, MAX_PENDING_INVITES_PER_WORKSPACE);
    }

    const token = randomBytes(24).toString("hex");
    const ttl = input.ttlMs ?? DEFAULT_TTL_MS;
    const expiresAt = new Date(Date.now() + ttl);

    const invite = await input.invites.create({
        token,
        workspaceId: input.workspaceId,
        email,
        invitedBy: input.invitedBy,
        role: input.role,
        expiresAt,
    });

    await sendInviteEmail({
        mailer: input.mailer,
        email,
        acceptUrl: input.acceptUrl(token),
        expiresAt,
        token,
    });

    return invite;
}
