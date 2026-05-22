/**
 * Entry redirect for `/workspace`. Resolves the active workspace from the
 * cookie or the user's first membership and redirects to
 * `/workspace/[workspaceId]`. When the user has no memberships, renders the
 * onboarding empty state with a "Create workspace" CTA.
 *
 * Login's `callbackURL` points here so newly-signed-in users land on a real
 * workspace home without each page having to repeat resolution logic.
 */

import { AppShell } from "@/components/shell/app-shell";
import { WORKSPACE_COOKIE, resolveActiveWorkspaceId } from "@/components/shell/app-shell-helpers";
import { Button } from "@/components/ui/button";
import { requireSessionUI } from "@/lib/auth";
import { listWorkspacesForUser } from "@/lib/identity/workspaces-for-user";
import { buildWorkspacePath } from "@/lib/routes";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function WorkspaceEntryPage() {
    const session = await requireSessionUI();

    const memberships = await listWorkspacesForUser(session.user.id);
    const first = memberships[0];
    if (!first) {
        return (
            <AppShell>
                <OnboardingEmptyState email={session.user.email} />
            </AppShell>
        );
    }

    const cookieStore = await cookies();
    // memberships is non-empty, so resolveActiveWorkspaceId always returns a
    // non-null id; fall back to `first.id` to satisfy the type.
    const resolved =
        resolveActiveWorkspaceId({
            fromUrl: undefined,
            fromCookie: cookieStore.get(WORKSPACE_COOKIE)?.value,
            available: memberships,
        }) ?? first.id;
    redirect(buildWorkspacePath(resolved));
}

function OnboardingEmptyState({ email }: { readonly email: string }) {
    return (
        <div className="flex min-h-[60vh] items-center justify-center px-4">
            <section className="w-full max-w-md rounded-[8px] border border-border bg-background p-6 text-center">
                <h2 className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                    Welcome to Bursora
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">
                    Signed in as {email}. Create a workspace to start tracking spend, budgets, and
                    alerts.
                </p>
                <Button asChild className="mt-5">
                    <Link href="/workspace/new">Create workspace</Link>
                </Button>
            </section>
        </div>
    );
}
