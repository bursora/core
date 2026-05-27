"use server";

/**
 * Server actions for the billing section. Wrapped via `withWorkspace` so each
 * action receives a verified session + membership ctx and redirects
 * unauthenticated callers to /login.
 */

import { type ActionResult, actionFail, actionOk } from "@/lib/action-result";
import {
    rethrowRedirect,
    workspaceIdFromForm,
    workspaceIdFromPrevForm,
} from "@/lib/actions/form-fields";
import { withWorkspace } from "@/lib/actions/with-workspace";
import { buildWorkspacePath } from "@/lib/routes";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCheckoutSession, getBillingPortalUrl, requestRefund } from "./billing/server";

// Provider-hosted URLs are external and not part of typedRoutes' generated
// union. Cast through Route<string> so the redirect call still type-checks.
const externalRoute = (url: string): Route => url as Route;

export const createCheckoutAction = withWorkspace(
    async (ctx, formData: FormData): Promise<void> => {
        const workspaceId = workspaceIdFromForm(formData);
        const checkout = await createCheckoutSession({
            workspaceId,
            userEmail: ctx.session.user.email,
        });
        redirect(externalRoute(checkout.url));
    },
    { getWorkspaceId: workspaceIdFromForm },
);

export const openPortalAction = withWorkspace(
    async (_ctx, formData: FormData): Promise<void> => {
        const workspaceId = workspaceIdFromForm(formData);
        const portal = await getBillingPortalUrl({ workspaceId });
        redirect(externalRoute(portal.url));
    },
    { getWorkspaceId: workspaceIdFromForm },
);

/**
 * Money-back guarantee. Only workspace owners can fire this — the refund
 * cancels the subscription so it's not a member-level operation. Returns
 * a status string through the standard ActionResult envelope so the
 * confirmation dialog can surface the outcome.
 */
export const requestRefundAction = withWorkspace(
    async (ctx, _prev: ActionResult, formData: FormData): Promise<ActionResult> => {
        try {
            if (ctx.membership.role !== "owner") {
                return actionFail("Only the workspace owner can request a refund.");
            }
            const workspaceId = workspaceIdFromForm(formData);
            const result = await requestRefund({ workspaceId });
            revalidatePath(buildWorkspacePath(workspaceId, "settings"));

            switch (result.status) {
                case "refunded":
                    return actionOk();
                case "not_eligible":
                    return actionFail("The 30-day refund window has passed for this workspace.");
                case "no_invoices":
                    return actionFail("No paid invoices are on file to refund.");
            }
        } catch (err: unknown) {
            rethrowRedirect(err);
            const message = err instanceof Error ? err.message : "Failed to request refund.";
            return actionFail(message);
        }
    },
    { getWorkspaceId: workspaceIdFromPrevForm },
);
