/**
 * Authorization test for the members-page server actions `inviteAction` and
 * `cancelInviteAction`. Server actions are directly invokable regardless of
 * UI gating, so the privilege check must live in the action itself: invites
 * are owner-only.
 *
 * We mock the action's collaborators (`@/lib/auth`, `@/lib/identity/server`,
 * `next/cache`) and the `MembersList` client component so we can capture the
 * action closures the page wires up and invoke them directly with a fake
 * session of a given membership role.
 */

import type { InviteFormState } from "@/app/(dashboard)/workspace/[workspaceId]/members/_components/invite-form";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const ACTOR = "actor-user-id";

type Role = "owner" | "member";

// Drives the faithful assert fakes below. Each test sets the acting user's
// role before invoking the page so the gates behave like production.
let actorRole: Role = "member";

// Captured per render so a test can invoke them after setting actorRole.
let invokedInvites: Array<{ email: string; role: Role }> = [];
let invokedCancels: Array<{ email: string }> = [];

let realAuth: Record<string, unknown>;
let realIdentity: Record<string, unknown>;
let realCache: Record<string, unknown>;

beforeAll(async () => {
    realAuth = { ...(await import("@/lib/auth")) };
    realIdentity = { ...(await import("@/lib/identity/server")) };
    realCache = { ...(await import("next/cache")) };

    mock.module("@/lib/auth", () => ({
        ...realAuth,
        requireSessionUI: async () => ({ user: { id: ACTOR } }),
        getRequestSession: async () => ({ user: { id: ACTOR } }),
    }));

    mock.module("next/cache", () => ({
        ...realCache,
        revalidatePath: () => undefined,
    }));

    mock.module("@/lib/identity/server", () => ({
        ...realIdentity,
        // Avoid the DB; the page reads these to render its list/pending props.
        listWorkspaceMembers: async () => [
            { workspaceId: WORKSPACE, userId: ACTOR, role: actorRole },
        ],
        listPendingInvites: async () => [],
        // Faithful owner gate: throws for non-owners with the real message.
        assertWorkspaceOwner: async () => {
            if (actorRole !== "owner") throw new Error("owner role required");
            return { workspaceId: WORKSPACE, userId: ACTOR, role: actorRole };
        },
        inviteMember: async (input: { email: string; role: Role }) => {
            invokedInvites.push({ email: input.email, role: input.role });
            return { token: "t", expiresAt: new Date(), email: input.email, acceptedAt: null };
        },
        cancelPendingInvite: async (input: { email: string }) => {
            invokedCancels.push({ email: input.email });
        },
    }));

    // Capture the action closures the page passes down without rendering the
    // real client component.
    mock.module(
        "@/app/(dashboard)/workspace/[workspaceId]/members/_components/members-list",
        () => ({
            MembersList: (props: {
                action: (p: InviteFormState, f: FormData) => Promise<InviteFormState>;
                cancelAction: (f: FormData) => Promise<{ ok: boolean; error?: string }>;
            }) => {
                capturedInviteAction = props.action;
                capturedCancelAction = props.cancelAction;
                return null;
            },
        }),
    );
});

afterAll(() => {
    mock.module("@/lib/auth", () => realAuth);
    mock.module("@/lib/identity/server", () => realIdentity);
    mock.module("next/cache", () => realCache);
});

let capturedInviteAction: (p: InviteFormState, f: FormData) => Promise<InviteFormState>;
let capturedCancelAction: (f: FormData) => Promise<{ ok: boolean; error?: string }>;

const renderPage = async (role: Role) => {
    actorRole = role;
    invokedInvites = [];
    invokedCancels = [];
    const { default: MembersPage } =
        await import("@/app/(dashboard)/workspace/[workspaceId]/members/page");
    const element = await MembersPage({ params: Promise.resolve({ workspaceId: WORKSPACE }) });
    renderToStaticMarkup(element);
};

const inviteForm = (email: string, role: Role): FormData => {
    const f = new FormData();
    f.set("email", email);
    f.set("role", role);
    return f;
};

describe("members invite/cancel actions are owner-only", () => {
    test("member inviting a member role is rejected", async () => {
        await renderPage("member");

        const result = await capturedInviteAction(
            { error: null, invitedEmail: null },
            inviteForm("new@acme.test", "member"),
        );

        expect(result.error).toBe("owner role required");
        expect(result.invitedEmail).toBeNull();
        expect(invokedInvites).toHaveLength(0);
    });

    test("member inviting an owner role is rejected", async () => {
        await renderPage("member");

        const result = await capturedInviteAction(
            { error: null, invitedEmail: null },
            inviteForm("new@acme.test", "owner"),
        );

        expect(result.error).toBe("owner role required");
        expect(invokedInvites).toHaveLength(0);
    });

    test("member cancelling an invite is rejected", async () => {
        await renderPage("member");

        const result = await capturedCancelAction(inviteForm("pending@acme.test", "member"));

        expect(result.ok).toBe(false);
        expect(result.error).toBe("owner role required");
        expect(invokedCancels).toHaveLength(0);
    });

    test("owner can invite both member and owner roles", async () => {
        await renderPage("owner");

        const asMember = await capturedInviteAction(
            { error: null, invitedEmail: null },
            inviteForm("teammate@acme.test", "member"),
        );
        const asOwner = await capturedInviteAction(
            { error: null, invitedEmail: null },
            inviteForm("cofounder@acme.test", "owner"),
        );

        expect(asMember.error).toBeNull();
        expect(asMember.invitedEmail).toBe("teammate@acme.test");
        expect(asOwner.error).toBeNull();
        expect(asOwner.invitedEmail).toBe("cofounder@acme.test");
        expect(invokedInvites).toEqual([
            { email: "teammate@acme.test", role: "member" },
            { email: "cofounder@acme.test", role: "owner" },
        ]);
    });

    test("owner can cancel an invite", async () => {
        await renderPage("owner");

        const result = await capturedCancelAction(inviteForm("pending@acme.test", "member"));

        expect(result.ok).toBe(true);
        expect(invokedCancels).toEqual([{ email: "pending@acme.test" }]);
    });
});
