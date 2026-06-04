import {
    AccountDeletionBlockedError,
    reactivateAccountUseCase,
    requestAccountDeletionUseCase,
} from "@/lib/identity";
import { describe, expect, test } from "bun:test";
import { InMemoryApiKeyRepository } from "./fakes/in-memory-api-key.repository";
import { InMemoryMemberRepository } from "./fakes/in-memory-member.repository";
import { InMemoryUserRepository } from "./fakes/in-memory-user.repository";
import { InMemoryWorkspaceRepository } from "./fakes/in-memory-workspace.repository";

const NOW = new Date("2026-06-04T00:00:00.000Z");
const GRACE_MS = 60_000;

function setup() {
    return {
        workspaces: new InMemoryWorkspaceRepository(),
        members: new InMemoryMemberRepository(),
        users: new InMemoryUserRepository(),
        keys: new InMemoryApiKeyRepository(),
    };
}

describe("requestAccountDeletionUseCase", () => {
    test("schedules deletion, suspends keys, clears sessions, notifies", async () => {
        const { workspaces, members, users, keys } = setup();
        const ws = await workspaces.create({ name: "Solo" });
        await members.addMember({ workspaceId: ws.id, userId: "u", role: "owner" });
        users.seed("u");
        keys.seed({ id: "k1", workspaceId: ws.id });

        const scheduled: { userId: string; scheduledAt: Date }[] = [];
        const result = await requestAccountDeletionUseCase({
            userId: "u",
            now: NOW,
            graceMs: GRACE_MS,
            users,
            members,
            workspaces,
            keys,
            onScheduled: async (i) => {
                scheduled.push(i);
            },
        });

        const expectedAt = new Date(NOW.getTime() + GRACE_MS);
        expect(result.scheduledAt).toEqual(expectedAt);
        expect(users.state("u")?.status).toBe("pending_deletion");
        expect(users.state("u")?.deletionScheduledAt).toEqual(expectedAt);
        expect(users.state("u")?.sessions).toBe(0);
        expect(keys.find("k1")?.suspendedAt).toEqual(NOW);
        expect(scheduled).toEqual([{ userId: "u", scheduledAt: expectedAt }]);
    });

    test("blocks on a shared sole-owned workspace and changes nothing", async () => {
        const { workspaces, members, users, keys } = setup();
        const ws = await workspaces.create({ name: "Team" });
        await members.addMember({ workspaceId: ws.id, userId: "owner", role: "owner" });
        await members.addMember({ workspaceId: ws.id, userId: "mate", role: "member" });
        users.seed("owner");
        keys.seed({ id: "k1", workspaceId: ws.id });

        await expect(
            requestAccountDeletionUseCase({
                userId: "owner",
                now: NOW,
                users,
                members,
                workspaces,
                keys,
            }),
        ).rejects.toBeInstanceOf(AccountDeletionBlockedError);

        expect(users.state("owner")?.status).toBe("active");
        expect(keys.find("k1")?.suspendedAt).toBeNull();
    });

    test("suspends keys only in purged workspaces, not co-owned ones", async () => {
        const { workspaces, members, users, keys } = setup();
        const solo = await workspaces.create({ name: "Solo" });
        await members.addMember({ workspaceId: solo.id, userId: "u", role: "owner" });
        const co = await workspaces.create({ name: "Co" });
        await members.addMember({ workspaceId: co.id, userId: "u", role: "owner" });
        await members.addMember({ workspaceId: co.id, userId: "other", role: "owner" });
        users.seed("u");
        keys.seed({ id: "solo-key", workspaceId: solo.id });
        keys.seed({ id: "co-key", workspaceId: co.id });

        await requestAccountDeletionUseCase({
            userId: "u",
            now: NOW,
            users,
            members,
            workspaces,
            keys,
        });

        expect(keys.find("solo-key")?.suspendedAt).toEqual(NOW);
        expect(keys.find("co-key")?.suspendedAt).toBeNull();
    });
});

describe("reactivateAccountUseCase", () => {
    test("reverts a pending account: clears flag and un-suspends keys", async () => {
        const { workspaces, members, users, keys } = setup();
        const ws = await workspaces.create({ name: "Solo" });
        await members.addMember({ workspaceId: ws.id, userId: "u", role: "owner" });
        users.seed("u", {
            status: "pending_deletion",
            deletionScheduledAt: new Date(NOW.getTime() + GRACE_MS),
        });
        keys.seed({ id: "k1", workspaceId: ws.id, suspendedAt: NOW });

        const reactivated = await reactivateAccountUseCase({ userId: "u", users, members, keys });

        expect(reactivated).toBe(true);
        expect(users.state("u")?.status).toBe("active");
        expect(users.state("u")?.deletionScheduledAt).toBeNull();
        expect(keys.find("k1")?.suspendedAt).toBeNull();
    });

    test("is a no-op for an active account", async () => {
        const { members, users, keys } = setup();
        users.seed("v");

        const reactivated = await reactivateAccountUseCase({ userId: "v", users, members, keys });

        expect(reactivated).toBe(false);
        expect(users.state("v")?.status).toBe("active");
    });
});
