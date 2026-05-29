/**
 * Open a checkout session for the active Bursora Cloud plan.
 *
 * The variant id is resolved from the (non-EE) plan read repo, not from env:
 * the active plan's `lsVariantId` is the SKU the customer subscribes to. This
 * keeps the single source of truth in the `plans` table that the daily sync
 * fills, so a re-priced plan flows through without redeploying.
 */

import type { PlanReadRepository } from "@/lib/plans/plan";
import type { PaymentProviderAdapter } from "./payment-provider.adapter";

/**
 * Thrown when checkout runs with no active plan on file — a self-host or
 * unseeded install. Surfaces loudly instead of opening an empty checkout
 * against a missing variant.
 */
export class NoActiveCloudPlanError extends Error {
    constructor() {
        super("no active cloud plan configured");
        this.name = "NoActiveCloudPlanError";
    }
}

export interface CreateCheckoutSessionUseCaseInput {
    readonly workspaceId: string;
    readonly userEmail: string;
    readonly successUrl: string;
    readonly cancelUrl: string;
    readonly provider: PaymentProviderAdapter;
    readonly plans: PlanReadRepository;
}

export async function createCheckoutSessionUseCase(
    input: CreateCheckoutSessionUseCaseInput,
): Promise<{ url: string }> {
    const plan = await input.plans.findActive();
    if (!plan) {
        throw new NoActiveCloudPlanError();
    }
    const session = await input.provider.createCheckoutSession({
        workspaceId: input.workspaceId,
        userEmail: input.userEmail,
        variantId: plan.lsVariantId,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
    });
    return { url: session.url };
}
