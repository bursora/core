/**
 * Tests for workspace owner resolution — the single deterministic owner the
 * budget preflight resolves once and reads both ways (platform role for the
 * admin-owned bypass, user id for the billing read). A workspace can have two
 * owners, so the resolution must be stable: an admin owner always wins,
 * otherwise the oldest, then the lowest id. Pure: in-memory repo, no DB.
 */

import { USER_ROLE } from "@/lib/identity";
import { describe, expect, test } from "bun:test";
import { InMemoryMemberRepository } from "./fakes/in-memory-member.repository";

describe("findOwner", () => {
    test("admin owner resolves with id and platform role", async () => {
        const members = new InMemoryMemberRepository();
        await members.addMember({ workspaceId: "ws-1", userId: "u1", role: "owner" });
        members.setUserRole("u1", "admin");

        expect(await members.findOwner("ws-1")).toEqual({ userId: "u1", role: USER_ROLE.admin });
    });

    test("regular owner resolves with the user platform role", async () => {
        const members = new InMemoryMemberRepository();
        await members.addMember({ workspaceId: "ws-1", userId: "u1", role: "owner" });
        members.setUserRole("u1", "user");

        expect(await members.findOwner("ws-1")).toEqual({ userId: "u1", role: USER_ROLE.user });
    });

    // A beta owner drives the cloud paywall bypass via `roleGrantsFreeAccess`,
    // so `findOwner` must carry `beta` through unchanged — never collapse it to
    // `user`. The Drizzle path narrows `users.role` with `toUserRole`, which
    // round-trips beta; this asserts the resolved owner keeps it.
    test("beta owner resolves with the beta platform role (not collapsed to user)", async () => {
        const members = new InMemoryMemberRepository();
        await members.addMember({ workspaceId: "ws-1", userId: "u1", role: "owner" });
        members.setUserRole("u1", "beta");

        expect(await members.findOwner("ws-1")).toEqual({ userId: "u1", role: USER_ROLE.beta });
    });

    test("no owner row found → null", async () => {
        const members = new InMemoryMemberRepository();
        expect(await members.findOwner("ws-1")).toBeNull();
    });

    // A workspace can have two owners (the invite form allows a second). The
    // resolved owner must not flip based on which row the DB returns first: an
    // admin owner always wins, regardless of insertion order.
    test("two owners, admin wins regardless of insertion order", async () => {
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

            expect(await members.findOwner(ws)).toEqual({
                userId: "admin-user",
                role: USER_ROLE.admin,
            });
        }
    });

    test("two non-admin owners resolve to the oldest with the user role", async () => {
        const members = new InMemoryMemberRepository();
        const ws = "ws-regular";
        await members.addMember({ workspaceId: ws, userId: "u1", role: "owner" });
        await members.addMember({ workspaceId: ws, userId: "u2", role: "owner" });

        expect(await members.findOwner(ws)).toEqual({ userId: "u1", role: USER_ROLE.user });
    });
});
