import { AppShell } from "@/components/shell/app-shell";
import {
    WORKSPACE_COOKIE,
    WORKSPACE_COOKIE_MAX_AGE_SECONDS,
} from "@/components/shell/app-shell-helpers";
import { getRequestSession, requireSessionUI } from "@/lib/auth";
import { createWorkspace } from "@/lib/identity/server";
import { buildWorkspacePath } from "@/lib/routes";
import { Building2 } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NewWorkspaceForm, type NewWorkspaceState } from "./new-workspace-form";

async function createWorkspaceAction(
    _prev: NewWorkspaceState,
    formData: FormData,
): Promise<NewWorkspaceState> {
    "use server";

    const session = await getRequestSession();
    if (!session) redirect("/login");

    const name = String(formData.get("name") ?? "").trim();
    if (name.length === 0) {
        return { error: "Workspace name is required" };
    }

    const rawEnvironment = String(formData.get("environment") ?? "").trim();
    const environment = rawEnvironment.length > 0 ? rawEnvironment : undefined;

    let workspaceId: string;
    try {
        const result = await createWorkspace({
            name,
            ownerId: session.user.id,
            ...(environment ? { environment } : {}),
        });
        workspaceId = result.workspace.id;
    } catch (err: unknown) {
        return {
            error: err instanceof Error ? err.message : "Failed to create workspace",
        };
    }

    const jar = await cookies();
    jar.set(WORKSPACE_COOKIE, workspaceId, {
        path: "/",
        maxAge: WORKSPACE_COOKIE_MAX_AGE_SECONDS,
        sameSite: "lax",
    });

    redirect(buildWorkspacePath(workspaceId, "keys"));
}

export default async function NewWorkspacePage() {
    await requireSessionUI();

    return (
        <AppShell>
            <div className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16">
                <section className="rounded-[8px] border border-border bg-background p-6">
                    <div className="flex items-start gap-3">
                        <div
                            className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-foreground"
                            aria-hidden
                        >
                            <Building2 className="h-5 w-5" />
                        </div>
                        <div className="space-y-1.5">
                            <h2 className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                                Create a workspace
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Workspaces hold your API keys, budgets, and team members.
                            </p>
                        </div>
                    </div>
                    <div className="mt-5">
                        <NewWorkspaceForm action={createWorkspaceAction} />
                    </div>
                </section>
            </div>
        </AppShell>
    );
}
