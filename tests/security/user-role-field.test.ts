/**
 * Locks the global platform `role` on users: schema column + better-auth
 * field config. `role` is admin|user, defaults to "user", and is NOT
 * client-writable (`input: false`) so signup/profile/API input can never set
 * it. Distinct from the per-workspace `workspace_members.role` (owner/member).
 */

import { auth } from "@/lib/auth";
import { schema } from "@/lib/db";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, test } from "bun:test";

describe("users.role column", () => {
    test("exists with text type and a 'user' default", () => {
        const { columns } = getTableConfig(schema.users);
        const role = columns.find((c) => c.name === "role");

        expect(role).toBeDefined();
        expect(role?.notNull).toBe(true);
        expect(role?.default).toBe("user");
    });
});

describe("better-auth user.role field", () => {
    test("is exposed as an additional field defaulting to 'user'", () => {
        const role = auth.options.user?.additionalFields?.role;

        expect(role).toBeDefined();
        expect(role?.type).toBe("string");
        expect(role?.defaultValue).toBe("user");
    });

    test("is not client-writable (input: false) so signup/update/API cannot set it", () => {
        const role = auth.options.user?.additionalFields?.role;

        expect(role?.input).toBe(false);
    });
});
