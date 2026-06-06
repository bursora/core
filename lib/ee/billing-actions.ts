"use server";

/**
 * Server actions for the billing section. Billing is account-level: checkout
 * and the customer portal key to the signed-in user, not a workspace. Each
 * action re-verifies the session (redirecting unauthenticated callers to
 * /login) since the layout guard does not cover action POSTs.
 */

import { anonymousId, captureServerEvent } from "@/lib/analytics/server-capture";
import { requireSessionUI } from "@/lib/auth";
import { parseBillingInterval } from "@/lib/plans/plan";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { createCheckoutSession, getBillingPortalUrl } from "./billing/server";

// Provider-hosted URLs are external and not part of typedRoutes' generated
// union. Cast through Route<string> so the redirect call still type-checks.
const externalRoute = (url: string): Route => url as Route;

export async function createCheckoutAction(formData: FormData): Promise<void> {
    const session = await requireSessionUI();
    // The interval comes from a hidden form field the user controls, so it is
    // validated here rather than trusted. An absent or unknown value falls back
    // to monthly.
    const interval = parseBillingInterval(formData.get("interval")) ?? "month";
    const checkout = await createCheckoutSession({
        userId: session.user.id,
        userEmail: session.user.email,
        interval,
    });
    // Funnel beacon before we hand off to the provider's checkout. No PII: the
    // distinct id is a hash of the user id. No-ops on self-host.
    await captureServerEvent({
        event: "subscribe_started",
        distinctId: anonymousId(session.user.id),
        properties: { interval },
    });
    redirect(externalRoute(checkout.url));
}

export async function openPortalAction(): Promise<void> {
    const session = await requireSessionUI();
    const portal = await getBillingPortalUrl({ userId: session.user.id });
    redirect(externalRoute(portal.url));
}
