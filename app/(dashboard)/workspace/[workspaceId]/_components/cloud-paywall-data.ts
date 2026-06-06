import "server-only";

import { env } from "@/lib/env";
import { getWorkspaceOwnerUserId } from "@/lib/identity/server";
import { getCheckoutAction } from "@/lib/onboarding/plan-entry";
import { getOnboardingPlan } from "@/lib/onboarding/plan-view";
import type { BillingInterval } from "@/lib/plans/plan";

export interface CloudPaywallData {
    readonly isOwner: boolean;
    readonly price: string;
    readonly interval: BillingInterval;
    readonly features: readonly string[];
    readonly checkoutAction?: (formData: FormData) => Promise<void>;
}

/**
 * Resolve the paywall's display + action props for a viewer. Only the workspace
 * owner gets a checkout action: the gate keys off the owner's subscription, so a
 * member (or co-owner who isn't the resolved owner) subscribing would not unlock
 * the workspace. Price and value bullets come from the synced plans table.
 *
 * Shared by the full-page paywall and the settings Activity-tab paywall so both
 * resolve owner + plan identically.
 */
export async function resolveCloudPaywallData(
    workspaceId: string,
    userId: string,
): Promise<CloudPaywallData> {
    const [ownerId, plan] = await Promise.all([
        getWorkspaceOwnerUserId(workspaceId),
        getOnboardingPlan(),
    ]);
    // The paywall only renders on cloud, where the daily sync leaves a monthly
    // (and usually annual) plan row. Prefer monthly for the headline price, fall
    // back to annual if only that interval is synced. No row at all is a real
    // misconfiguration — surface it rather than fabricate a price.
    const headline = plan?.monthly ?? plan?.annual;
    if (!headline) {
        throw new Error(
            "resolveCloudPaywallData: no synced cloud plan; price must come from the plans table",
        );
    }
    const isOwner = ownerId !== null && ownerId === userId;
    const checkoutAction = isOwner && env().IS_CLOUD ? await getCheckoutAction() : undefined;

    return {
        isOwner,
        price: headline.price,
        interval: headline.interval,
        // Skip the events-ceiling bullet (features[0]); the unlock pitch leads
        // with what the dashboard gives, not the fair-use cap. `plan` is non-null
        // here (headline derives from it).
        features: (plan?.features ?? []).slice(1, 4),
        ...(checkoutAction ? { checkoutAction } : {}),
    };
}
