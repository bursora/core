/**
 * `toUserRole` — the validated boundary narrow for the `users.role` text
 * column. It must round-trip every known platform role (admin, beta, user) and
 * default only genuinely-unknown strings (and null/undefined) to `user`.
 *
 * This is the unit that the `findOwner` / `getRole` paths route through, so it
 * is the test that would have caught the production-only `beta → user` collapse
 * the in-memory fake hid.
 */

import { toUserRole, USER_ROLE } from "@/lib/identity/user-role";
import { describe, expect, test } from "bun:test";

describe("toUserRole", () => {
    test("admin round-trips", () => {
        expect(toUserRole("admin")).toBe(USER_ROLE.admin);
    });

    test("beta round-trips (not collapsed to user)", () => {
        expect(toUserRole("beta")).toBe(USER_ROLE.beta);
    });

    test("user round-trips", () => {
        expect(toUserRole("user")).toBe(USER_ROLE.user);
    });

    test("unknown string defaults to user", () => {
        expect(toUserRole("garbage")).toBe(USER_ROLE.user);
    });

    test("null defaults to user", () => {
        expect(toUserRole(null)).toBe(USER_ROLE.user);
    });

    test("undefined defaults to user", () => {
        expect(toUserRole(undefined)).toBe(USER_ROLE.user);
    });
});
