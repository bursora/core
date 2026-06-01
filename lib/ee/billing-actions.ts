"use server";

/**
 * Server actions for the billing section. Billing is account-level: checkout
 * and the customer portal key to the signed-in user, not a workspace. Each
 * action re-verifies the session (redirecting unauthenticated callers to
 * /login) since the layout guard does not cover action POSTs.
 */

import { requireSessionUI } from "@/lib/auth";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { createCheckoutSession, getBillingPortalUrl } from "./billing/server";

// Provider-hosted URLs are external and not part of typedRoutes' generated
// union. Cast through Route<string> so the redirect call still type-checks.
const externalRoute = (url: string): Route => url as Route;

export async function createCheckoutAction(): Promise<void> {
    const session = await requireSessionUI();
    const checkout = await createCheckoutSession({
        userId: session.user.id,
        userEmail: session.user.email,
    });
    redirect(externalRoute(checkout.url));
}

export async function openPortalAction(): Promise<void> {
    const session = await requireSessionUI();
    const portal = await getBillingPortalUrl({ userId: session.user.id });
    redirect(externalRoute(portal.url));
}
