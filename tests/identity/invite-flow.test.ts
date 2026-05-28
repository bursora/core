import {
    acceptInviteUseCase,
    InviteCapExceededError,
    inviteMemberUseCase,
    MAX_PENDING_INVITES_PER_WORKSPACE,
    resendInviteUseCase,
} from "@/lib/identity";
import { describe, expect, test } from "bun:test";
import { CapturingMailer } from "./fakes/capturing-mailer";
import {
    InMemoryInviteRepository,
    InMemoryMemberRepository,
} from "./fakes/in-memory-member.repository";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const OWNER = "owner-user-id";
const INVITED_USER = "invited-user-id";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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

    test("inviteMember sets the invite to expire within 24 hours by default", async () => {
        const invites = new InMemoryInviteRepository();
        const mailer = new CapturingMailer();

        const before = Date.now();
        const result = await inviteMemberUseCase({
            workspaceId: WORKSPACE,
            email: "teammate@acme.test",
            invitedBy: OWNER,
            role: "member",
            invites,
            mailer,
            acceptUrl: (token) => `/invite/${token}`,
        });
        const after = Date.now();

        const expiresAtMs = result.expiresAt.getTime();
        expect(expiresAtMs).toBeGreaterThan(before);
        expect(expiresAtMs).toBeLessThanOrEqual(after + ONE_DAY_MS);
        // A 7-day token would land far outside 24h + a small slack.
        expect(expiresAtMs - before).toBeLessThanOrEqual(ONE_DAY_MS + 1_000);
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

    test("claim refuses an expired invite atomically (no TOCTOU on expiry)", async () => {
        const invites = new InMemoryInviteRepository();

        await invites.create({
            token: "expired-claim-token",
            workspaceId: WORKSPACE,
            email: "teammate@acme.test",
            invitedBy: OWNER,
            role: "member",
            expiresAt: new Date(Date.now() - 1_000),
        });

        const claimed = await invites.claim("expired-claim-token", new Date());
        expect(claimed).toBeNull();
    });

    test("acceptInvite is single-use under concurrent calls (no TOCTOU race)", async () => {
        const invites = new InMemoryInviteRepository();
        const members = new InMemoryMemberRepository();

        await invites.create({
            token: "race-token",
            workspaceId: WORKSPACE,
            email: "teammate@acme.test",
            invitedBy: OWNER,
            role: "member",
            expiresAt: new Date(Date.now() + 60_000),
        });

        // Widen the TOCTOU window so a non-atomic check-then-set would race.
        invites.findByTokenDelayMs = 20;

        const results = await Promise.allSettled([
            acceptInviteUseCase({
                token: "race-token",
                userId: "user-a",
                invites,
                members,
            }),
            acceptInviteUseCase({
                token: "race-token",
                userId: "user-b",
                invites,
                members,
            }),
        ]);

        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter((r) => r.status === "rejected");

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
            message: "invite already accepted",
        });
    });

    test("inviteMember rejects when the workspace is at the pending-invite cap", async () => {
        const invites = new InMemoryInviteRepository();
        const mailer = new CapturingMailer();

        const expiresAt = new Date(Date.now() + 60_000);
        for (let i = 0; i < MAX_PENDING_INVITES_PER_WORKSPACE; i += 1) {
            await invites.create({
                token: `seed-token-${i}`,
                workspaceId: WORKSPACE,
                email: `seed-${i}@acme.test`,
                invitedBy: OWNER,
                role: "member",
                expiresAt,
            });
        }

        await expect(
            inviteMemberUseCase({
                workspaceId: WORKSPACE,
                email: "overflow@acme.test",
                invitedBy: OWNER,
                role: "member",
                invites,
                mailer,
                acceptUrl: (t) => `/invite/${t}`,
            }),
        ).rejects.toBeInstanceOf(InviteCapExceededError);

        // existing invites still valid; overflow attempt didn't write a row
        const pending = await invites.listPendingByWorkspace(WORKSPACE);
        expect(pending).toHaveLength(MAX_PENDING_INVITES_PER_WORKSPACE);
        expect(mailer.messages).toHaveLength(0);
    });

    test("resendInvite rotates the token: old link 404s, new link accepts", async () => {
        const invites = new InMemoryInviteRepository();
        const members = new InMemoryMemberRepository();
        const mailer = new CapturingMailer();

        await members.addMember({
            workspaceId: WORKSPACE,
            userId: OWNER,
            role: "owner",
        });

        const original = await inviteMemberUseCase({
            workspaceId: WORKSPACE,
            email: "teammate@acme.test",
            invitedBy: OWNER,
            role: "member",
            invites,
            mailer,
            acceptUrl: (t) => `/invite/${t}`,
        });

        const resent = await resendInviteUseCase({
            workspaceId: WORKSPACE,
            email: "teammate@acme.test",
            actorUserId: OWNER,
            invites,
            members,
            mailer,
            acceptUrl: (t) => `/invite/${t}`,
        });

        expect(resent.token).not.toBe(original.token);

        // Old token is dead.
        await expect(
            acceptInviteUseCase({
                token: original.token,
                userId: INVITED_USER,
                invites,
                members,
            }),
        ).rejects.toThrow();

        // New token works.
        const accepted = await acceptInviteUseCase({
            token: resent.token,
            userId: INVITED_USER,
            invites,
            members,
        });
        expect(accepted.membership.workspaceId).toBe(WORKSPACE);
    });

    test("resendInvite rejects when the actor is not a workspace owner", async () => {
        const invites = new InMemoryInviteRepository();
        const members = new InMemoryMemberRepository();
        const mailer = new CapturingMailer();

        await members.addMember({
            workspaceId: WORKSPACE,
            userId: OWNER,
            role: "owner",
        });
        await members.addMember({
            workspaceId: WORKSPACE,
            userId: "regular-member",
            role: "member",
        });

        await inviteMemberUseCase({
            workspaceId: WORKSPACE,
            email: "teammate@acme.test",
            invitedBy: OWNER,
            role: "member",
            invites,
            mailer,
            acceptUrl: (t) => `/invite/${t}`,
        });

        await expect(
            resendInviteUseCase({
                workspaceId: WORKSPACE,
                email: "teammate@acme.test",
                actorUserId: "regular-member",
                invites,
                members,
                mailer,
                acceptUrl: (t) => `/invite/${t}`,
            }),
        ).rejects.toThrow(/owner/i);
    });

    test("inviteMember ignores accepted invites when applying the cap", async () => {
        const invites = new InMemoryInviteRepository();
        const mailer = new CapturingMailer();

        const expiresAt = new Date(Date.now() + 60_000);
        for (let i = 0; i < MAX_PENDING_INVITES_PER_WORKSPACE; i += 1) {
            await invites.create({
                token: `accepted-token-${i}`,
                workspaceId: WORKSPACE,
                email: `accepted-${i}@acme.test`,
                invitedBy: OWNER,
                role: "member",
                expiresAt,
            });
            await invites.claim(`accepted-token-${i}`, new Date());
        }

        const invite = await inviteMemberUseCase({
            workspaceId: WORKSPACE,
            email: "fresh@acme.test",
            invitedBy: OWNER,
            role: "member",
            invites,
            mailer,
            acceptUrl: (t) => `/invite/${t}`,
        });

        expect(invite.email).toBe("fresh@acme.test");
        expect(invite.acceptedAt).toBeNull();
    });
});
