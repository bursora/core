"use server";

/**
 * Dismiss action for the dashboard "Getting started" widget. Membership-scoped
 * via `withWorkspace` — the workspace id comes from the form, fed back into the
 * membership check so it can't be spoofed. Sets the per-workspace dismiss cookie
 * and revalidates the home page so the widget disappears on the next render.
 */

import { workspaceIdFromForm } from "@/lib/actions/form-fields";
import { withWorkspace } from "@/lib/actions/with-workspace";
import { setOnboardingDismissed } from "@/lib/onboarding/dismiss-cookie";
import { buildWorkspacePath } from "@/lib/routes";
import { revalidatePath } from "next/cache";

export const dismissGettingStartedAction = withWorkspace(
    async (_ctx, formData: FormData): Promise<void> => {
        const workspaceId = workspaceIdFromForm(formData);
        await setOnboardingDismissed(workspaceId);
        revalidatePath(buildWorkspacePath(workspaceId));
    },
    { getWorkspaceId: workspaceIdFromForm },
);
