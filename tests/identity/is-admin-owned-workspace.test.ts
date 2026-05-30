/**
 * Tests for `isAdminOwnedWorkspaceUseCase` — the resolver that says whether a
 * workspace's owner is a platform admin. Drives the rate-limit and fair-use
 * exemptions for admin-run workspaces. Pure: repo injected, no DB.
 */

import type { MemberRepository } from "@/lib/identity";
import { isAdminOwnedWorkspaceUseCase } from "@/lib/identity";
import { describe, expect, test } from "bun:test";
import { InMemoryMemberRepository } from "./fakes/in-memory-member.repository";

const repoWithOwnerRole = (role: string | null): MemberRepository =>
    ({
        async findOwnerUserRole(): Promise<string | null> {
            return role;
        },
    }) as unknown as MemberRepository;

describe("isAdminOwnedWorkspaceUseCase", () => {
    test("owner is a platform admin → true", async () => {
        const result = await isAdminOwnedWorkspaceUseCase({
            workspaceId: "ws-1",
            members: repoWithOwnerRole("admin"),
        });
        expect(result).toBe(true);
    });

    test("owner is a regular user → false", async () => {
        const result = await isAdminOwnedWorkspaceUseCase({
            workspaceId: "ws-1",
            members: repoWithOwnerRole("user"),
        });
        expect(result).toBe(false);
    });

    test("no owner row found → false", async () => {
        const result = await isAdminOwnedWorkspaceUseCase({
            workspaceId: "ws-1",
            members: repoWithOwnerRole(null),
        });
        expect(result).toBe(false);
    });

    // A workspace can have two owners (the invite form allows a second). The
    // bypass must not flip based on which owner row the DB returns first: an
    // admin owner always wins, regardless of insertion order.
    test("two owners, one admin → true regardless of insertion order", async () => {
        for (const adminFirst of [true, false]) {
            const members = new InMemoryMemberRepository();
            const ws = "ws-multi";
            const order = adminFirst
                ? ["admin-user", "regular-user"]
                : ["regular-user", "admin-user"];
            for (const userId of order) {
                await members.addMember({ workspaceId: ws, userId, role: "owner" });
            }
            members.setUserRole("admin-user", "admin");
            members.setUserRole("regular-user", "user");

            const result = await isAdminOwnedWorkspaceUseCase({ workspaceId: ws, members });
            expect(result).toBe(true);
        }
    });

    test("two non-admin owners → false", async () => {
        const members = new InMemoryMemberRepository();
        const ws = "ws-regular";
        await members.addMember({ workspaceId: ws, userId: "u1", role: "owner" });
        await members.addMember({ workspaceId: ws, userId: "u2", role: "owner" });

        const result = await isAdminOwnedWorkspaceUseCase({ workspaceId: ws, members });
        expect(result).toBe(false);
    });
});
