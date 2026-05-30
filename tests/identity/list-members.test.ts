import type { MemberListRow, MemberRepository, MemberRole, WorkspaceMember } from "@/lib/identity";
import { listMembersUseCase } from "@/lib/identity";
import { describe, expect, test } from "bun:test";

class FakeMemberRepository implements MemberRepository {
    constructor(private readonly rows: readonly MemberListRow[]) {}

    async addMember(): Promise<WorkspaceMember> {
        throw new Error("not used");
    }
    async findMembership(): Promise<WorkspaceMember | null> {
        return null;
    }
    async listByWorkspace(workspaceId: string): Promise<readonly MemberListRow[]> {
        return this.rows.filter((r) => r.workspaceId === workspaceId);
    }
    async listMemberUserIds(workspaceId: string): Promise<readonly string[]> {
        return this.rows.filter((r) => r.workspaceId === workspaceId).map((r) => r.userId);
    }
    async findOwnerUserRole(): Promise<string | null> {
        return null;
    }
}

describe("listMembersUseCase", () => {
    test("returns members for a workspace with email and role", async () => {
        const workspaceId = "ws-1";
        const role: MemberRole = "owner";
        const repo = new FakeMemberRepository([
            {
                workspaceId,
                userId: "u-1",
                email: "owner@acme.test",
                role,
                createdAt: new Date("2026-01-01T00:00:00Z"),
            },
            {
                workspaceId: "other",
                userId: "u-2",
                email: "nope@x.test",
                role: "member",
                createdAt: new Date(),
            },
        ]);

        const result = await listMembersUseCase({ workspaceId, members: repo });

        expect(result).toHaveLength(1);
        expect(result[0]?.email).toBe("owner@acme.test");
        expect(result[0]?.role).toBe("owner");
        expect(result[0]?.userId).toBe("u-1");
    });
});
