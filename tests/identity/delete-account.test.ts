import {
    AccountDeletionBlockedError,
    deleteAccountUseCase,
    type UserRepository,
} from "@/lib/identity";
import { describe, expect, test } from "bun:test";
import { InMemoryMemberRepository } from "./fakes/in-memory-member.repository";
import { InMemoryWorkspaceRepository } from "./fakes/in-memory-workspace.repository";

class FakeUserRepository implements UserRepository {
    readonly deleted: string[] = [];
    constructor(private readonly onDelete?: () => void) {}
    async delete(userId: string): Promise<void> {
        this.onDelete?.();
        this.deleted.push(userId);
    }
    async getStatus(): Promise<null> {
        return null;
    }
    async scheduleDeletion(): Promise<void> {}
    async cancelDeletion(): Promise<void> {}
    async listDueForPurge(): Promise<readonly string[]> {
        return [];
    }
    async clearSessions(): Promise<void> {}
}

function setup() {
    return {
        workspaces: new InMemoryWorkspaceRepository(),
        members: new InMemoryMemberRepository(),
        users: new FakeUserRepository(),
    };
}

describe("deleteAccountUseCase", () => {
    test("deletes a solo user's sole-member workspace and the user", async () => {
        const { workspaces, members, users } = setup();
        const ws = await workspaces.create({ name: "Solo" });
        await members.addMember({ workspaceId: ws.id, userId: "u", role: "owner" });

        const erased: string[][] = [];
        await deleteAccountUseCase({
            userId: "u",
            users,
            members,
            workspaces,
            onWorkspacesDeleted: async (ids) => {
                erased.push([...ids]);
            },
        });

        expect(await workspaces.findById(ws.id)).toBeNull();
        expect(users.deleted).toEqual(["u"]);
        expect(erased).toEqual([[ws.id]]);
    });

    test("blocks when the sole owner still has other members, deleting nothing", async () => {
        const { workspaces, members, users } = setup();
        const ws = await workspaces.create({ name: "Team" });
        await members.addMember({ workspaceId: ws.id, userId: "owner", role: "owner" });
        await members.addMember({ workspaceId: ws.id, userId: "mate", role: "member" });

        const err = await deleteAccountUseCase({
            userId: "owner",
            users,
            members,
            workspaces,
        }).catch((e: unknown) => e);

        expect(err).toBeInstanceOf(AccountDeletionBlockedError);
        expect((err as AccountDeletionBlockedError).workspaces).toEqual([
            { id: ws.id, name: "Team" },
        ]);
        expect(await workspaces.findById(ws.id)).not.toBeNull();
        expect(users.deleted).toEqual([]);
    });

    test("leaves a co-owned workspace intact and deletes the user", async () => {
        const { workspaces, members, users } = setup();
        const ws = await workspaces.create({ name: "Co" });
        await members.addMember({ workspaceId: ws.id, userId: "owner", role: "owner" });
        await members.addMember({ workspaceId: ws.id, userId: "coowner", role: "owner" });
        await members.addMember({ workspaceId: ws.id, userId: "mate", role: "member" });

        const erased: string[][] = [];
        await deleteAccountUseCase({
            userId: "owner",
            users,
            members,
            workspaces,
            onWorkspacesDeleted: async (ids) => {
                erased.push([...ids]);
            },
        });

        expect(await workspaces.findById(ws.id)).not.toBeNull();
        expect(users.deleted).toEqual(["owner"]);
        expect(erased).toEqual([]);
    });

    test("a plain member's deletion leaves the owner's workspace intact", async () => {
        const { workspaces, members, users } = setup();
        const ws = await workspaces.create({ name: "Other" });
        await members.addMember({ workspaceId: ws.id, userId: "owner", role: "owner" });
        await members.addMember({ workspaceId: ws.id, userId: "guest", role: "member" });

        await deleteAccountUseCase({ userId: "guest", users, members, workspaces });

        expect(await workspaces.findById(ws.id)).not.toBeNull();
        expect(users.deleted).toEqual(["guest"]);
    });

    test("runs onBeforeUserDelete before deleting the user", async () => {
        const { workspaces, members } = setup();
        const order: string[] = [];
        const users = new FakeUserRepository(() => order.push("delete"));

        await deleteAccountUseCase({
            userId: "loner",
            users,
            members,
            workspaces,
            onBeforeUserDelete: async () => {
                order.push("hook");
            },
        });

        expect(order).toEqual(["hook", "delete"]);
    });

    test("a blocked workspace stops deletion of an otherwise-deletable one", async () => {
        const { workspaces, members, users } = setup();
        const solo = await workspaces.create({ name: "Solo" });
        await members.addMember({ workspaceId: solo.id, userId: "u", role: "owner" });
        const team = await workspaces.create({ name: "Team" });
        await members.addMember({ workspaceId: team.id, userId: "u", role: "owner" });
        await members.addMember({ workspaceId: team.id, userId: "mate", role: "member" });

        await expect(
            deleteAccountUseCase({ userId: "u", users, members, workspaces }),
        ).rejects.toBeInstanceOf(AccountDeletionBlockedError);

        expect(await workspaces.findById(solo.id)).not.toBeNull();
        expect(users.deleted).toEqual([]);
    });
});
