import { acceptInviteUseCase, inviteMemberUseCase } from "@/lib/identity";
import { describe, expect, test } from "bun:test";
import { CapturingMailer } from "./fakes/capturing-mailer";
import {
    InMemoryInviteRepository,
    InMemoryMemberRepository,
} from "./fakes/in-memory-member.repository";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const OWNER = "owner-user-id";
const INVITED_USER = "invited-user-id";

describe("invite + accept flow", () => {
    test("inviteMember creates a pending invite and sends a magic-link email", async () => {
        const invites = new InMemoryInviteRepository();
        const mailer = new CapturingMailer();

        const result = await inviteMemberUseCase({
            workspaceId: WORKSPACE,
            email: "teammate@acme.test",
            invitedBy: OWNER,
            role: "member",
            invites,
            mailer,
            acceptUrl: (token) => `https://app.bursora.com/invite/${token}`,
        });

        expect(result.token).toBeTruthy();
        const stored = await invites.findByToken(result.token);
        expect(stored).not.toBeNull();
        expect(stored?.email).toBe("teammate@acme.test");
        expect(stored?.acceptedAt).toBeNull();
        expect(stored?.expiresAt.getTime()).toBeGreaterThan(Date.now());

        expect(mailer.messages).toHaveLength(1);
        expect(mailer.messages[0]?.to).toBe("teammate@acme.test");
        expect(mailer.messages[0]?.text).toContain(result.token);
    });

    test("acceptInvite upgrades a pending invite to active membership", async () => {
        const invites = new InMemoryInviteRepository();
        const members = new InMemoryMemberRepository();
        const mailer = new CapturingMailer();

        const invite = await inviteMemberUseCase({
            workspaceId: WORKSPACE,
            email: "teammate@acme.test",
            invitedBy: OWNER,
            role: "member",
            invites,
            mailer,
            acceptUrl: (t) => `/invite/${t}`,
        });

        const accepted = await acceptInviteUseCase({
            token: invite.token,
            userId: INVITED_USER,
            invites,
            members,
        });

        expect(accepted.membership.workspaceId).toBe(WORKSPACE);
        expect(accepted.membership.userId).toBe(INVITED_USER);
        expect(accepted.membership.role).toBe("member");

        const stored = await invites.findByToken(invite.token);
        expect(stored?.acceptedAt).not.toBeNull();
    });

    test("acceptInvite rejects an unknown token", async () => {
        const invites = new InMemoryInviteRepository();
        const members = new InMemoryMemberRepository();

        await expect(
            acceptInviteUseCase({
                token: "totally-bogus",
                userId: INVITED_USER,
                invites,
                members,
            }),
        ).rejects.toThrow();
    });

    test("acceptInvite rejects an already-accepted token", async () => {
        const invites = new InMemoryInviteRepository();
        const members = new InMemoryMemberRepository();
        const mailer = new CapturingMailer();

        const invite = await inviteMemberUseCase({
            workspaceId: WORKSPACE,
            email: "teammate@acme.test",
            invitedBy: OWNER,
            role: "member",
            invites,
            mailer,
            acceptUrl: (t) => `/invite/${t}`,
        });

        await acceptInviteUseCase({
            token: invite.token,
            userId: INVITED_USER,
            invites,
            members,
        });

        await expect(
            acceptInviteUseCase({
                token: invite.token,
                userId: "someone-else",
                invites,
                members,
            }),
        ).rejects.toThrow();
    });

    test("acceptInvite rejects an expired token", async () => {
        const invites = new InMemoryInviteRepository();
        const members = new InMemoryMemberRepository();

        await invites.create({
            token: "expired-token",
            workspaceId: WORKSPACE,
            email: "teammate@acme.test",
            invitedBy: OWNER,
            role: "member",
            expiresAt: new Date(Date.now() - 1000),
        });

        await expect(
            acceptInviteUseCase({
                token: "expired-token",
                userId: INVITED_USER,
                invites,
                members,
            }),
        ).rejects.toThrow();
    });
});
