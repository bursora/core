/**
 * Open a checkout session for the active Bursora Cloud plan on the requested
 * billing interval (monthly or annual).
 *
 * The variant id is resolved from the (non-EE) plan read repo, not from env:
 * the active plan whose `interval` matches carries the `lsVariantId` the
 * customer subscribes to. This keeps the single source of truth in the `plans`
 * table that the daily sync fills, so a re-priced plan flows through without
 * redeploying.
 */

import type { BillingInterval, PlanReadRepository } from "@/lib/plans/plan";
import type { PaymentProviderAdapter } from "./payment-provider.adapter";

/**
 * Thrown when checkout runs with no active plan on file for the requested
 * interval — a self-host, unseeded install, or an interval LS has no variant
 * for. Surfaces loudly instead of opening an empty checkout against a missing
 * variant.
 */
export class NoActiveCloudPlanError extends Error {
    constructor() {
        super("no active cloud plan configured");
        this.name = "NoActiveCloudPlanError";
    }
}

export interface CreateCheckoutSessionUseCaseInput {
    readonly userId: string;
    readonly userEmail: string;
    readonly interval: BillingInterval;
    readonly successUrl: string;
    readonly cancelUrl: string;
    readonly provider: PaymentProviderAdapter;
    readonly plans: PlanReadRepository;
}

export async function createCheckoutSessionUseCase(
    input: CreateCheckoutSessionUseCaseInput,
): Promise<{ url: string }> {
    const active = await input.plans.listActive();
    const plan = active.find((p) => p.interval === input.interval);
    if (!plan) {
        throw new NoActiveCloudPlanError();
    }
    const session = await input.provider.createCheckoutSession({
        userId: input.userId,
        userEmail: input.userEmail,
        variantId: plan.lsVariantId,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
    });
    return { url: session.url };
}
