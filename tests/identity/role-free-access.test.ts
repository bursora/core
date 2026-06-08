/**
 * `roleGrantsFreeAccess` — the single source of truth for "this global role is
 * entitled to free, full-featured platform access on cloud". Only `beta`
 * qualifies. Admin is deliberately NOT included here: admin has its own,
 * broader exemptions (rate-limit + fair-use bypass) wired through separate
 * axes, while a beta account keeps every enforcement live and only skips the
 * subscription paywall + onboarding pay-step.
 */

import { roleGrantsFreeAccess, USER_ROLE } from "@/lib/identity/user-role";
import { describe, expect, test } from "bun:test";

describe("roleGrantsFreeAccess", () => {
    test("beta grants free access", () => {
        expect(roleGrantsFreeAccess(USER_ROLE.beta)).toBe(true);
    });

    test("plain user does not grant free access", () => {
        expect(roleGrantsFreeAccess(USER_ROLE.user)).toBe(false);
    });

    test("admin does not grant free access here (handled by its own axes)", () => {
        expect(roleGrantsFreeAccess(USER_ROLE.admin)).toBe(false);
    });
});
