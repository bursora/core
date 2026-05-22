import { AuthShell } from "@/components/shell/auth-shell";
import { getRequestSession } from "@/lib/auth";
import { acceptInvite } from "@/lib/identity/server";
import { buildWorkspacePath } from "@/lib/routes";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { AcceptInviteForm, type AcceptInviteState } from "./accept-invite-form";

interface PageProps {
    params: Promise<{ token: string }>;
}

async function acceptAction(
    _prev: AcceptInviteState,
    formData: FormData,
): Promise<AcceptInviteState> {
    "use server";

    const token = String(formData.get("token") ?? "");
    const session = await getRequestSession();
    if (!session) redirect(`/login?next=/invite/${token}` as Route);

    let workspaceId: string;
    try {
        const result = await acceptInvite({ token, userId: session.user.id });
        workspaceId = result.workspaceId;
    } catch (err: unknown) {
        return {
            error: err instanceof Error ? err.message : "Could not accept invite",
        };
    }

    redirect(buildWorkspacePath(workspaceId, "keys"));
}

export default async function AcceptInvitePage({ params }: PageProps) {
    const { token } = await params;

    return (
        <AuthShell
            title="Accept invitation"
            description="Sign in (or sign up) and click below to join the workspace."
        >
            <AcceptInviteForm token={token} action={acceptAction} />
        </AuthShell>
    );
}
