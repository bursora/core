import { PageHeader } from "@/components/shell/page-header";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { getRequestSession, requireSessionUI } from "@/lib/auth";
import type { MemberRole } from "@/lib/identity";
import {
    assertWorkspaceOwner,
    cancelPendingInvite,
    changeWorkspaceMemberRole,
    inviteMember,
    listPendingInvites,
    listWorkspaceMembers,
    removeWorkspaceMember,
} from "@/lib/identity/server";
import { buildWorkspacePath } from "@/lib/routes";
import { revalidatePath } from "next/cache";
import type { InviteFormState } from "./_components/invite-form";
import { MembersList } from "./_components/members-list";

interface PageProps {
    params: Promise<{ workspaceId: string }>;
}

export default async function MembersPage({ params }: PageProps) {
    const { workspaceId } = await params;

    // Members stays reachable without an active subscription so a lapsed
    // workspace can still manage who has access to it.
    const session = await requireSessionUI();

    const [members, pending] = await Promise.all([
        listWorkspaceMembers(workspaceId),
        listPendingInvites(workspaceId),
    ]);

    const currentUserId = session.user.id;
    const viewerIsOwner = members.some((m) => m.userId === currentUserId && m.role === "owner");

    async function inviteAction(
        _prev: InviteFormState,
        formData: FormData,
    ): Promise<InviteFormState> {
        "use server";

        const email = String(formData.get("email") ?? "").trim();
        const roleRaw = String(formData.get("role") ?? "member");
        const role = roleRaw === "owner" ? "owner" : "member";

        if (email.length === 0) {
            return { error: "Email is required.", invitedEmail: null };
        }

        try {
            const session = await getRequestSession();
            if (!session) return { error: "Sign in required.", invitedEmail: null };

            await assertWorkspaceOwner({ workspaceId, userId: session.user.id });
            await inviteMember({
                workspaceId,
                email,
                invitedBy: session.user.id,
                role,
            });
            revalidatePath(buildWorkspacePath(workspaceId, "members"));
            return { error: null, invitedEmail: email };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to send invite.";
            return { error: message, invitedEmail: null };
        }
    }

    async function cancelInviteAction(formData: FormData): Promise<ActionResult> {
        "use server";

        const email = String(formData.get("email") ?? "").trim();
        if (email.length === 0) return actionFail("Email required.");

        try {
            const s = await getRequestSession();
            if (!s) return actionFail("Sign in required.");
            await assertWorkspaceOwner({ workspaceId, userId: s.user.id });
            await cancelPendingInvite({ workspaceId, email });
            revalidatePath(buildWorkspacePath(workspaceId, "members"));
            return actionOk();
        } catch (err) {
            return actionFail(err instanceof Error ? err.message : "Failed to cancel invite.");
        }
    }

    async function removeMemberAction(formData: FormData): Promise<ActionResult> {
        "use server";

        const userId = String(formData.get("userId") ?? "");
        if (userId.length === 0) return actionFail("Member required.");

        try {
            const s = await getRequestSession();
            if (!s) return actionFail("Sign in required.");
            await assertWorkspaceOwner({ workspaceId, userId: s.user.id });
            await removeWorkspaceMember({ workspaceId, userId });
            revalidatePath(buildWorkspacePath(workspaceId, "members"));
            return actionOk();
        } catch (err) {
            return actionFail(err instanceof Error ? err.message : "Failed to remove member.");
        }
    }

    async function changeRoleAction(formData: FormData): Promise<ActionResult> {
        "use server";

        const userId = String(formData.get("userId") ?? "");
        const role: MemberRole =
            String(formData.get("role") ?? "") === "owner" ? "owner" : "member";
        if (userId.length === 0) return actionFail("Member required.");

        try {
            const s = await getRequestSession();
            if (!s) return actionFail("Sign in required.");
            await assertWorkspaceOwner({ workspaceId, userId: s.user.id });
            await changeWorkspaceMemberRole({ workspaceId, userId, role });
            revalidatePath(buildWorkspacePath(workspaceId, "members"));
            return actionOk();
        } catch (err) {
            return actionFail(err instanceof Error ? err.message : "Failed to update role.");
        }
    }

    return (
        <section>
            <PageHeader title="Members" subtitle="Invite teammates and manage workspace access." />
            <MembersList
                members={members}
                pending={pending.map((p) => ({
                    email: p.email,
                    role: p.role,
                    createdAt: p.createdAt,
                    expiresAt: p.expiresAt,
                }))}
                currentUserId={currentUserId}
                viewerIsOwner={viewerIsOwner}
                action={inviteAction}
                cancelAction={cancelInviteAction}
                removeAction={removeMemberAction}
                changeRoleAction={changeRoleAction}
            />
        </section>
    );
}
