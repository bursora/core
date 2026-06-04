import { changeMemberRoleUseCase, removeMemberUseCase } from "@/lib/identity";
import { describe, expect, test } from "bun:test";
import { InMemoryMemberRepository } from "./fakes/in-memory-member.repository";

const WS = "ws-1";

async function seed(members: ReadonlyArray<{ userId: string; role: "owner" | "member" }>) {
    const repo = new InMemoryMemberRepository();
    for (const m of members)
        await repo.addMember({ workspaceId: WS, userId: m.userId, role: m.role });
    return repo;
}

describe("removeMemberUseCase", () => {
    test("removes a non-owner member", async () => {
        const repo = await seed([
            { userId: "owner", role: "owner" },
            { userId: "member", role: "member" },
        ]);

        await removeMemberUseCase({ workspaceId: WS, userId: "member", members: repo });

        expect(await repo.findMembership(WS, "member")).toBeNull();
        expect(await repo.findMembership(WS, "owner")).not.toBeNull();
    });

    test("removes an owner when another owner remains", async () => {
        const repo = await seed([
            { userId: "owner-a", role: "owner" },
            { userId: "owner-b", role: "owner" },
        ]);

        await removeMemberUseCase({ workspaceId: WS, userId: "owner-a", members: repo });

        expect(await repo.findMembership(WS, "owner-a")).toBeNull();
        expect(await repo.countOwners(WS)).toBe(1);
    });

    test("refuses to remove the last owner", async () => {
        const repo = await seed([
            { userId: "owner", role: "owner" },
            { userId: "member", role: "member" },
        ]);

        await expect(
            removeMemberUseCase({ workspaceId: WS, userId: "owner", members: repo }),
        ).rejects.toThrow(/last owner/);
        expect(await repo.findMembership(WS, "owner")).not.toBeNull();
    });

    test("throws when the target is not a member", async () => {
        const repo = await seed([{ userId: "owner", role: "owner" }]);

        await expect(
            removeMemberUseCase({ workspaceId: WS, userId: "ghost", members: repo }),
        ).rejects.toThrow(/not a member/);
    });
});

describe("changeMemberRoleUseCase", () => {
    test("promotes a member to owner (ownership transfer)", async () => {
        const repo = await seed([
            { userId: "owner", role: "owner" },
            { userId: "member", role: "member" },
        ]);

        await changeMemberRoleUseCase({
            workspaceId: WS,
            userId: "member",
            role: "owner",
            members: repo,
        });

        expect((await repo.findMembership(WS, "member"))?.role).toBe("owner");
        expect(await repo.countOwners(WS)).toBe(2);
    });

    test("demotes an owner when another owner remains", async () => {
        const repo = await seed([
            { userId: "owner-a", role: "owner" },
            { userId: "owner-b", role: "owner" },
        ]);

        await changeMemberRoleUseCase({
            workspaceId: WS,
            userId: "owner-a",
            role: "member",
            members: repo,
        });

        expect((await repo.findMembership(WS, "owner-a"))?.role).toBe("member");
        expect(await repo.countOwners(WS)).toBe(1);
    });

    test("refuses to demote the last owner", async () => {
        const repo = await seed([
            { userId: "owner", role: "owner" },
            { userId: "member", role: "member" },
        ]);

        await expect(
            changeMemberRoleUseCase({
                workspaceId: WS,
                userId: "owner",
                role: "member",
                members: repo,
            }),
        ).rejects.toThrow(/at least one owner/);
        expect((await repo.findMembership(WS, "owner"))?.role).toBe("owner");
    });

    test("is a no-op when the role is unchanged", async () => {
        const repo = await seed([{ userId: "owner", role: "owner" }]);

        await changeMemberRoleUseCase({
            workspaceId: WS,
            userId: "owner",
            role: "owner",
            members: repo,
        });

        expect((await repo.findMembership(WS, "owner"))?.role).toBe("owner");
    });

    test("throws when the target is not a member", async () => {
        const repo = await seed([{ userId: "owner", role: "owner" }]);

        await expect(
            changeMemberRoleUseCase({
                workspaceId: WS,
                userId: "ghost",
                role: "owner",
                members: repo,
            }),
        ).rejects.toThrow(/not a member/);
    });
});
