/**
 * Tests for `isAdminOwnedWorkspaceUseCase` — the resolver that says whether a
 * workspace's owner is a platform admin. Drives the rate-limit and fair-use
 * exemptions for admin-run workspaces. Pure: repo injected, no DB.
 */

import { isAdminOwnedWorkspaceUseCase } from "@/lib/identity";
import type { MemberRepository } from "@/lib/identity";
import { describe, expect, test } from "bun:test";

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
});
