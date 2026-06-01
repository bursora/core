/**
 * Entry redirect for `/workspace`. Resolves the active workspace from the
 * cookie or the user's first membership and redirects to
 * `/workspace/[workspaceId]`. When the user has no memberships, redirects
 * straight into the setup wizard: cloud + unsubscribed (and not already
 * skipped) starts at the plan step; everyone else at the workspace step.
 *
 * Login's `callbackURL` points here so newly-signed-in users land on a real
 * workspace home (or the setup flow) without each page repeating resolution.
 */

import { WORKSPACE_COOKIE, resolveActiveWorkspaceId } from "@/components/shell/app-shell-helpers";
import { requireSessionUI } from "@/lib/auth";
import { env } from "@/lib/env";
import { listWorkspacesForUser } from "@/lib/identity/workspaces-for-user";
import { isUserSubscribed } from "@/lib/onboarding/plan-entry";
import { isPlanStepSkipped } from "@/lib/onboarding/plan-skip-cookie";
import { planStepReturnedActivePath, wizardStepPath } from "@/lib/onboarding/wizard-step";
import { buildWorkspacePath } from "@/lib/routes";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

interface WorkspaceEntryPageProps {
    searchParams: Promise<{ billing?: string }>;
}

export default async function WorkspaceEntryPage({ searchParams }: WorkspaceEntryPageProps) {
    const session = await requireSessionUI();

    const memberships = await listWorkspacesForUser(session.user.id);
    const first = memberships[0];
    if (!first) {
        if (env().IS_CLOUD) {
            const { billing } = await searchParams;
            // Back from checkout: forward to the plan step with the flag. The
            // activation webhook is async and usually lands after this redirect,
            // so the flag must outlive an unsubscribed check; the step polls until
            // it activates. Dropping it here strands the user on the buy card.
            if (billing === "ok") redirect(planStepReturnedActivePath());
            const subscribed = await isUserSubscribed(session.user.id);
            // Already subscribed, not returning from checkout: go create a workspace.
            if (subscribed) redirect(wizardStepPath(1));
            if (!(await isPlanStepSkipped(session.user.id))) redirect(wizardStepPath(0));
        }
        redirect(wizardStepPath(1));
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
