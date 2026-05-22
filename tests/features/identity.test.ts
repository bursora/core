/**
 * Identity feature integration test.
 *
 * Drives the public API exposed by `@/lib/identity` — the same surface
 * `app/` consumes. Uses in-memory fakes for the unit-style flows that are
 * already proven by the deeper tests in `tests/identity/`; the goal here is
 * to lock the feature folder's public contract.
 */

import {
    apiKeys as apiKeysTable,
    session as sessionTable,
    users as userTable,
    workspaceMembers as workspaceMembersTable,
    workspaces as workspacesTable,
} from "@/lib/db";
import {
    acceptInviteUseCase,
    API_KEY_PREFIX,
    createWorkspaceUseCase,
    inviteMemberUseCase,
    issueApiKeyUseCase,
    listApiKeysUseCase,
    revokeApiKeyUseCase,
} from "@/lib/identity";
import { CapturingMailer } from "@/tests/identity/fakes/capturing-mailer";
import { InMemoryApiKeyRepository } from "@/tests/identity/fakes/in-memory-api-key.repository";
import {
    InMemoryInviteRepository,
    InMemoryMemberRepository,
} from "@/tests/identity/fakes/in-memory-member.repository";
import { InMemoryWorkspaceRepository } from "@/tests/identity/fakes/in-memory-workspace.repository";
import { describe, expect, test } from "bun:test";

const PEPPER = "test-pepper";
const WORKSPACE = "11111111-2222-3333-4444-555555555555";

describe("@/lib/identity public API", () => {
    test("schema tables are re-exported", () => {
        // app-owned
        expect(workspacesTable).toBeDefined();
        expect(workspaceMembersTable).toBeDefined();
        expect(apiKeysTable).toBeDefined();
        // better-auth
        expect(userTable).toBeDefined();
        expect(sessionTable).toBeDefined();
    });

    test("workspace create assigns the creator as owner", async () => {
        const workspaces = new InMemoryWorkspaceRepository();
        const members = new InMemoryMemberRepository();
        const result = await createWorkspaceUseCase({
            name: "Acme",
            ownerId: "user-1",
            workspaces,
            members,
        });
        expect(result.workspace.name).toBe("Acme");
        const m = await members.findMembership(result.workspace.id, "user-1");
        expect(m?.role).toBe("owner");
    });

    test("invite + accept upgrades membership", async () => {
        const invites = new InMemoryInviteRepository();
        const members = new InMemoryMemberRepository();
        const mailer = new CapturingMailer();
        const invited = await inviteMemberUseCase({
            workspaceId: WORKSPACE,
            email: "t@acme.test",
            invitedBy: "owner",
            role: "member",
            invites,
            mailer,
            acceptUrl: (t: string) => `/invite/${t}`,
        });
        const accepted = await acceptInviteUseCase({
            token: invited.token,
            userId: "invited-user",
            invites,
            members,
        });
        expect(accepted.membership.workspaceId).toBe(WORKSPACE);
        expect(accepted.membership.role).toBe("member");
    });

    test("api-key issue + list + revoke (rotation)", async () => {
        const keys = new InMemoryApiKeyRepository();
        const issued = await issueApiKeyUseCase({
            workspaceId: WORKSPACE,
            name: "test",
            pepper: PEPPER,
            keys,
        });
        expect(issued.plaintext.startsWith(API_KEY_PREFIX)).toBe(true);
        const listed = await listApiKeysUseCase({ workspaceId: WORKSPACE, keys });
        expect(listed).toHaveLength(1);
        await revokeApiKeyUseCase({
            id: issued.id,
            workspaceId: WORKSPACE,
            keys,
        });
        const after = await listApiKeysUseCase({ workspaceId: WORKSPACE, keys });
        expect(after.find((k: { id: string }) => k.id === issued.id)?.revokedAt).not.toBeNull();
    });
});
