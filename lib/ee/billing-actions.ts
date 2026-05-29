"use server";

/**
 * Server actions for the billing section. Wrapped via `withWorkspace` so each
 * action receives a verified session + membership ctx and redirects
 * unauthenticated callers to /login.
 */

import { workspaceIdFromForm } from "@/lib/actions/form-fields";
import { withWorkspace } from "@/lib/actions/with-workspace";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { createCheckoutSession, getBillingPortalUrl } from "./billing/server";

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
