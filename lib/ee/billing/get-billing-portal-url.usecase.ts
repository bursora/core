import type { StripeAdapter } from "./types";
import type { WorkspaceBillingRepository } from "./workspace-billing.repository";

export interface GetBillingPortalUrlInput {
    readonly workspaceId: string;
    readonly returnUrl: string;
    readonly workspaces: WorkspaceBillingRepository;
    readonly stripe: StripeAdapter;
}

export interface GetBillingPortalUrlResult {
    readonly url: string;
}

/**
 * Thrown when the workspace exists but has not yet completed a Checkout, so
 * there is no Stripe customer to open a portal for. The route maps this to
 * a 409 / shows a "Subscribe first" message.
 */
export class BillingNotEnabledError extends Error {
    constructor(workspaceId: string) {
        super(`workspace ${workspaceId} has no Stripe customer`);
        this.name = "BillingNotEnabledError";
    }
}

export async function getBillingPortalUrlUseCase(
    input: GetBillingPortalUrlInput,
): Promise<GetBillingPortalUrlResult> {
    const record = await input.workspaces.findById(input.workspaceId);
    if (!record) {
        throw new Error(`workspace not found: ${input.workspaceId}`);
    }
    if (!record.stripeCustomerId) {
        throw new BillingNotEnabledError(input.workspaceId);
    }

    const session = await input.stripe.createPortalSession({
        customerId: record.stripeCustomerId,
        returnUrl: input.returnUrl,
    });
    return { url: session.url };
}
