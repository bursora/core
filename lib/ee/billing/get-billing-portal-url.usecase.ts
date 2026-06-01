import type { PaymentProviderAdapter } from "./types";
import type { UserBillingRepository } from "./user-billing.repository";

export interface GetBillingPortalUrlInput {
    readonly userId: string;
    readonly returnUrl: string;
    readonly users: UserBillingRepository;
    readonly provider: PaymentProviderAdapter;
}

export interface GetBillingPortalUrlResult {
    readonly url: string;
}

/**
 * Thrown when the user has not yet completed a Checkout, so there is no
 * billing-provider customer to open a portal for. The route maps this to a
 * 409 / shows a "Subscribe first" message.
 */
export class BillingNotEnabledError extends Error {
    constructor(userId: string) {
        super(`user ${userId} has no billing-provider customer`);
        this.name = "BillingNotEnabledError";
    }
}

export async function getBillingPortalUrlUseCase(
    input: GetBillingPortalUrlInput,
): Promise<GetBillingPortalUrlResult> {
    const record = await input.users.findByUserId(input.userId);
    if (!record?.providerCustomerId) {
        throw new BillingNotEnabledError(input.userId);
    }

    const session = await input.provider.createPortalSession({
        customerId: record.providerCustomerId,
        returnUrl: input.returnUrl,
    });
    return { url: session.url };
}
