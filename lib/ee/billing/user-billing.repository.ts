/**
 * Read/write a user's billing state. Lives here (not in the identity context)
 * because billing-provider ids and subscription status are billing-owned
 * even though the row keys off the better-auth user.
 *
 * The record is keyed by `userId` — the account that pays. A row is created on
 * first Checkout activation and upserted thereafter; absence of a row means the
 * user has never subscribed.
 *
 * `subscriptionStatus` mirrors the upstream provider's subscription state
 * verbatim (`active`, `past_due`, `unpaid`, `paused`, `cancelled`,
 * `expired`). `null` means never subscribed.
 *
 * `refundEligibleUntil` is set at checkout to signup + 30 days. UI reads this
 * to render the "money-back" badge; the refund use case clears it once the
 * customer claims the guarantee.
 *
 * `subscribedAt` is when the user first completed Checkout.
 */

export interface UserBillingRecord {
    readonly userId: string;
    readonly providerCustomerId: string | null;
    readonly providerSubscriptionId: string | null;
    readonly subscriptionStatus: string | null;
    readonly subscribedAt: Date | null;
    readonly refundEligibleUntil: Date | null;
}

export interface UserBillingUpsert {
    readonly userId: string;
    readonly providerCustomerId?: string | null;
    readonly providerSubscriptionId?: string | null;
    readonly subscriptionStatus?: string | null;
    readonly subscribedAt?: Date | null;
    readonly refundEligibleUntil?: Date | null;
}

export interface UserBillingRepository {
    findByUserId(userId: string): Promise<UserBillingRecord | null>;
    findByProviderCustomerId(customerId: string): Promise<UserBillingRecord | null>;
    upsert(input: UserBillingUpsert): Promise<void>;
}
