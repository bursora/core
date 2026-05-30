import { PageHeader } from "@/components/shell/page-header";
import { CloudPaywallPage } from "@/app/(dashboard)/workspace/[workspaceId]/_components/cloud-paywall-page";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { getRequestSession, requireSessionUI } from "@/lib/auth";
import { cloudWorkspaceLocked } from "@/lib/billing-gate/server";
import {
    assertWorkspaceMember,
    cancelPendingInvite,
    inviteMember,
    listPendingInvites,
    listWorkspaceMembers,
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

    // Secure gate: bail before listing members or pending invites so a locked
    // cloud workspace never has its roster or invited emails fetched.
    if (await cloudWorkspaceLocked(workspaceId)) {
        return (
            <CloudPaywallPage
                workspaceId={workspaceId}
                title="Members"
                subtitle="Invite teammates and manage workspace access."
            />
        );
    }

    await requireSessionUI();

    const [members, pending] = await Promise.all([
        listWorkspaceMembers(workspaceId),
        listPendingInvites(workspaceId),
    ]);

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

            await assertWorkspaceMember({ workspaceId, userId: session.user.id });
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
            await assertWorkspaceMember({ workspaceId, userId: s.user.id });
            await cancelPendingInvite({ workspaceId, email });
            revalidatePath(buildWorkspacePath(workspaceId, "members"));
            return actionOk();
        } catch (err) {
            return actionFail(err instanceof Error ? err.message : "Failed to cancel invite.");
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
                action={inviteAction}
                cancelAction={cancelInviteAction}
            />
        </section>
    );
}
