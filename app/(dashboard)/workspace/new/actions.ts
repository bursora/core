"use server";

/**
 * Server actions for the welcome wizard at `/workspace/new`.
 *
 * Step ① creates the workspace, sets the active-workspace cookie, issues the
 * first API key (idempotent — skips when a live key already exists), flashes the
 * plaintext via the issued-key cookie, then advances to step ②. Cookies can
 * only be set inside a Server Action, so the key is issued here rather than in
 * the step ② render; the plaintext is shown once on entry to step ②.
 *
 * The continue action advances to step ③ without clearing the flash, so the
 * wrap snippet there is copy-paste-ready with the real key; the flash clears
 * via its 5-minute TTL or the step-② "I've saved it" dismiss.
 */

import {
    ISSUED_KEY_COOKIE,
    ISSUED_KEY_COOKIE_MAX_AGE,
} from "@/app/(dashboard)/workspace/[workspaceId]/settings/issued-key-cookie";
import {
    WORKSPACE_COOKIE,
    WORKSPACE_COOKIE_MAX_AGE_SECONDS,
} from "@/components/shell/app-shell-helpers";
import { requestSourceIp } from "@/lib/actions/request-ip";
import { anonymousId, captureServerEvent } from "@/lib/analytics/server-capture";
import { getRequestSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { createWorkspace, issueApiKey, listApiKeys } from "@/lib/identity/server";
import { isUserSubscribed } from "@/lib/onboarding/plan-entry";
import { getOnboardingPlan } from "@/lib/onboarding/plan-view";
import { wizardStepPath, workspaceCreationGate } from "@/lib/onboarding/wizard-step";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NewWorkspaceState } from "./new-workspace-form";

const FIRST_KEY_NAME = "Default";

export async function createWorkspaceAction(
    _prev: NewWorkspaceState,
    formData: FormData,
): Promise<NewWorkspaceState> {
    const session = await getRequestSession();
    if (!session) redirect("/login");

    // Subscribe-first gate, enforced at the mutation (not just the page render).
    // Mirrors the step-1 gate in `page.tsx`: on cloud an unsubscribed owner with
    // a configured plan belongs on the plan step until checkout completes.
    const subscribed = await isUserSubscribed(session.user.id);
    if (
        workspaceCreationGate({ isCloud: env().IS_CLOUD, subscribed }) === 0 &&
        (await getOnboardingPlan())
    ) {
        redirect(wizardStepPath(0));
    }

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

    // Funnel beacon. No PII: the distinct id is a hash of the user id. No-ops on
    // self-host (no PostHog key).
    await captureServerEvent({
        event: "workspace_created",
        distinctId: anonymousId(session.user.id),
    });

    const jar = await cookies();
    jar.set(WORKSPACE_COOKIE, workspaceId, {
        path: "/",
        maxAge: WORKSPACE_COOKIE_MAX_AGE_SECONDS,
        sameSite: "lax",
    });

    // Auto-issue the first key so the user lands on step ② with a ready secret.
    // Idempotent: a freshly created workspace has no keys, but guard anyway so a
    // resubmit can't mint a second key or clobber an existing flash.
    const existing = await listApiKeys(workspaceId);
    if (!existing.some((k) => k.revokedAt === null)) {
        const issued = await issueApiKey({
            workspaceId,
            name: FIRST_KEY_NAME,
            userId: session.user.id,
            ip: await requestSourceIp(),
        });
        await captureServerEvent({
            event: "api_key_issued",
            distinctId: anonymousId(session.user.id),
        });
        jar.set(ISSUED_KEY_COOKIE, issued.plaintext, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: ISSUED_KEY_COOKIE_MAX_AGE,
            path: "/",
        });
    }

    redirect(wizardStepPath(2, workspaceId));
}

export async function continueToConnectAction(formData: FormData): Promise<void> {
    const session = await getRequestSession();
    if (!session) redirect("/login");

    const workspaceId = String(formData.get("ws") ?? "").trim();
    if (workspaceId.length === 0) redirect(wizardStepPath(1));

    // Keep the issued-key flash alive into step ③ so the wrap snippet renders
    // copy-paste-ready with the real key; it clears via its TTL or the step-②
    // "I've saved it" dismiss.
    redirect(wizardStepPath(3, workspaceId));
}
