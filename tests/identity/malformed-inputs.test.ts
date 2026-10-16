import type { AcceptInviteState } from "@/app/invite/[token]/accept-invite-form";
import AcceptInvitePage from "@/app/invite/[token]/page";
import { schema } from "@/lib/db";
import { DrizzleMemberRepository } from "@/lib/identity/drizzle-member.repository";
import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { createTestDb, type TestDbHandle } from "../support/pglite-db";

import { runIsolatedTest } from "../support/run-isolated-test";

// Other suites mock this repository module; regressions must run the real adapter.
if (process.env.BURSORA_ISOLATED_TEST !== import.meta.path) {
    test("malformed input regressions against the real repository and action", () =>
        runIsolatedTest(import.meta.path));
} else {
    let handle: TestDbHandle;
    beforeAll(async () => {
        handle = await createTestDb();
    });
    afterAll(async () => {
        await handle.close();
    });

    test("invalid workspace URLs have no owner or membership", async () => {
        const repo = new DrizzleMemberRepository(handle.db);
        expect(await repo.findOwner("acme-prod")).toBeNull();
        expect(
            await repo.findMembership("acme-prod", "11111111-2222-3333-4444-555555555555"),
        ).toBeNull();
    });

    test("valid workspace IDs still resolve owners and memberships", async () => {
        const userId = "11111111-2222-3333-4444-555555555555";
        const workspaceId = "99999999-8888-7777-6666-555555555555";
        await handle.db
            .insert(schema.users)
            .values({ id: userId, name: "Owner", email: "owner@example.com" });
        await handle.db.insert(schema.workspaces).values({ id: workspaceId, name: "Workspace" });
        const repo = new DrizzleMemberRepository(handle.db);
        await repo.addMember({ workspaceId, userId, role: "owner" });
        expect(await repo.findOwner(workspaceId)).toEqual({ userId, role: "user" });
        expect((await repo.findMembership(workspaceId, userId))?.role).toBe("owner");
    });

    test.each([undefined, null, {}, "invalid", new FormData()])(
        "malformed invite action arguments return an error (%p)",
        async (input) => {
            const page = await AcceptInvitePage({ params: Promise.resolve({ token: "test" }) });
            const form = page.props.children as ReactElement<{
                action: (prev: AcceptInviteState, data: FormData) => Promise<AcceptInviteState>;
            }>;
            const result = await form.props.action({ error: null }, input as FormData);
            expect(result.error).toBe("Invalid invitation request");
        },
    );
}
