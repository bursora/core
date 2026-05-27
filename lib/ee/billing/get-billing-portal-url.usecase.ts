import type { PaymentProviderAdapter } from "./types";
import type { WorkspaceBillingRepository } from "./workspace-billing.repository";

export interface GetBillingPortalUrlInput {
    readonly workspaceId: string;
    readonly returnUrl: string;
    readonly workspaces: WorkspaceBillingRepository;
    readonly provider: PaymentProviderAdapter;
}

export interface GetBillingPortalUrlResult {
    readonly url: string;
}

/**
 * Thrown when the workspace exists but has not yet completed a Checkout, so
 * there is no billing-provider customer to open a portal for. The route
 * maps this to a 409 / shows a "Subscribe first" message.
 */
export class BillingNotEnabledError extends Error {
    constructor(workspaceId: string) {
        super(`workspace ${workspaceId} has no billing-provider customer`);
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
    if (!record.providerCustomerId) {
        throw new BillingNotEnabledError(input.workspaceId);
    }

    const session = await input.provider.createPortalSession({
        customerId: record.providerCustomerId,
        returnUrl: input.returnUrl,
    });
    return { url: session.url };
}
