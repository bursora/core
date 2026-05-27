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
 * `lastInvoiceRef` is the most recent invoice the rollup pushed. Surfaced
 * back so the dashboard can deep-link to the receipt and so retries
 * can detect already-pushed months.
 *
 * `refundEligibleUntil` is set at checkout to signup + 30 days. UI reads
 * this to render the "money-back" badge. Refund execution itself ships
 * in a follow-up; this column only carries the eligibility window.
 *
 * `subscribedAt` is when the workspace first completed Checkout. The
 * rollup cron pro-rates the first invoice from this date.
 */

export interface WorkspaceBillingRecord {
    readonly workspaceId: string;
    readonly providerCustomerId: string | null;
    readonly providerSubscriptionId: string | null;
    readonly subscriptionStatus: string | null;
    readonly subscribedAt: Date | null;
    readonly refundEligibleUntil: Date | null;
    readonly lastInvoiceRef: string | null;
    /** YYYY-MM of the last month the rollup successfully pushed. */
    readonly lastBilledMonth: string | null;
}

export interface WorkspaceBillingUpdate {
    readonly workspaceId: string;
    readonly providerCustomerId?: string | null;
    readonly providerSubscriptionId?: string | null;
    readonly subscriptionStatus?: string | null;
    readonly subscribedAt?: Date | null;
    readonly refundEligibleUntil?: Date | null;
    readonly lastInvoiceRef?: string | null;
    readonly lastBilledMonth?: string | null;
}

export interface WorkspaceBillingRepository {
    findById(workspaceId: string): Promise<WorkspaceBillingRecord | null>;
    findByProviderCustomerId(customerId: string): Promise<WorkspaceBillingRecord | null>;
    findByInvoiceRef(invoiceRef: string): Promise<WorkspaceBillingRecord | null>;
    update(input: WorkspaceBillingUpdate): Promise<void>;
}

/**
 * Port for reading the event-bundle rollup from billing. Mirrors the
 * cold-store reader in `lib/event-bundle/types.ts` without forcing the
 * billing layer to depend on the event-bundle module's structure — the
 * dispatcher in `cloud/billing/index.ts` is free to point at either the
 * billing-only impl or the existing event-bundle usage repo.
 */
export interface EventBundleRollupRepository {
    /** Returns events accrued for the workspace in `YYYY-MM`, or 0 when absent. */
    findEventsCount(input: { workspaceId: string; month: string }): Promise<number>;
}
