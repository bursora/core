import { randomBytes } from "node:crypto";
import { sendInviteEmail, type Mailer } from "../notification";
import type { Invite } from "./member";
import type { InviteRepository, MemberRepository } from "./member.repository";

export interface ResendInviteInput {
    readonly workspaceId: string;
    readonly email: string;
    readonly actorUserId: string;
    readonly invites: InviteRepository;
    readonly members: MemberRepository;
    readonly mailer: Mailer;
    readonly acceptUrl: (token: string) => string;
    readonly ttlMs?: number;
}

// Matches `inviteMemberUseCase` so a resent invite gets the same 24h envelope
// the security model assumes.
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Issues a fresh token + expiry for an existing pending invite and emails a
 * new link. The old token is overwritten in place, so any forwarded or
 * intercepted copy of the previous email stops resolving immediately
 * (`findByToken` returns `null`).
 *
 * Owner role is required because this hands out a new credential to whoever
 * receives the email.
 */
export async function resendInviteUseCase(input: ResendInviteInput): Promise<Invite> {
    const membership = await input.members.findMembership(input.workspaceId, input.actorUserId);
    if (!membership || membership.role !== "owner") {
        throw new Error("owner role required");
    }

    const email = input.email.trim().toLowerCase();
    const newToken = randomBytes(24).toString("hex");
    const ttl = input.ttlMs ?? DEFAULT_TTL_MS;
    const newExpiresAt = new Date(Date.now() + ttl);

    const rotated = await input.invites.rotateToken({
        workspaceId: input.workspaceId,
        email,
        newToken,
        newExpiresAt,
    });
    if (!rotated) {
        throw new Error("no pending invite to resend");
    }

    await sendInviteEmail({
        mailer: input.mailer,
        email,
        acceptUrl: input.acceptUrl(newToken),
        expiresAt: newExpiresAt,
        token: newToken,
    });

    return rotated;
}
