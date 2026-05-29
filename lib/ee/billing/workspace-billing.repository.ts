/**
 * Read/write the billing-relevant fields on the workspaces row. Lives here
 * (not in the identity context) because billing-provider ids and
 * subscription status are billing-owned columns even though the row is
 * shared.
 *
 * `subscriptionStatus` mirrors the upstream provider's subscription state
 * verbatim (`active`, `trialing`, `past_due`, `canceled`, `unpaid`,
 * `incomplete`, `incomplete_expired`). `null` means the workspace has
 * never opened Checkout.
 *
 * `refundEligibleUntil` is set at checkout to signup + 30 days. UI reads
 * this to render the "money-back" badge; the refund use case clears it once
 * the customer claims the guarantee.
 *
 * `subscribedAt` is when the workspace first completed Checkout.
 */

export interface WorkspaceBillingRecord {
    readonly workspaceId: string;
    readonly providerCustomerId: string | null;
    readonly providerSubscriptionId: string | null;
    readonly subscriptionStatus: string | null;
    readonly subscribedAt: Date | null;
    readonly refundEligibleUntil: Date | null;
}

export interface WorkspaceBillingUpdate {
    readonly workspaceId: string;
    readonly providerCustomerId?: string | null;
    readonly providerSubscriptionId?: string | null;
    readonly subscriptionStatus?: string | null;
    readonly subscribedAt?: Date | null;
    readonly refundEligibleUntil?: Date | null;
}

export interface WorkspaceBillingRepository {
    findById(workspaceId: string): Promise<WorkspaceBillingRecord | null>;
    findByProviderCustomerId(customerId: string): Promise<WorkspaceBillingRecord | null>;
    update(input: WorkspaceBillingUpdate): Promise<void>;
}
