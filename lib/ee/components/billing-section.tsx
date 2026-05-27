/**
 * Billing panel for /settings.
 *
 * Workspaces with no provider customer on file see "Upgrade to Bursora cloud"
 * which opens Lemon Squeezy checkout. Once a customer record exists (any
 * status), a "Manage billing" button opens the LS customer portal where the
 * user can update payment, view invoices, or cancel. Workspaces with a
 * lapsed/cancelled subscription see both buttons. The `?billing=ok|cancel`
 * flag set on the redirect back from LS surfaces a small confirmation line.
 *
 * The money-back guarantee panel renders only while
 * `refund_eligible_until` is set and in the future. It survives subscription
 * cancellation: a customer who cancels through the portal mid-window can
 * still claim a refund on the charges they already paid.
 */

import { Button } from "@/components/ui/button";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { createCheckoutAction, openPortalAction } from "../billing-actions";
import { getWorkspaceBillingRecord } from "../billing/server";
import { NextBillEstimate } from "./next-bill-estimate";
import { PastDueBanner } from "./past-due-banner";
import { RefundPanel } from "./refund-panel";

interface BillingSectionProps {
    workspaceId: string;
    status: "ok" | "cancel" | null;
    isOwner: boolean;
}

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);

export async function BillingSection({ workspaceId, status, isOwner }: BillingSectionProps) {
    const record = await getWorkspaceBillingRecord(workspaceId);
    // Portal button: show whenever the workspace has a provider customer on
    // file, even if the subscription is cancelled. Lemon Squeezy's portal lets
    // the user see invoices and re-subscribe, so the entry point is useful
    // beyond active status.
    const hasProviderCustomer =
        record?.providerCustomerId !== null && record?.providerCustomerId !== undefined;
    const hasActiveSubscription =
        hasProviderCustomer &&
        record?.subscriptionStatus !== null &&
        ACTIVE_STATUSES.has(record?.subscriptionStatus ?? "");
    // eslint-disable-next-line react-hooks/purity -- server-rendered once per request; current time is the eligibility cutoff
    const now = Date.now();
    const refundEligibleUntil =
        record?.refundEligibleUntil && record.refundEligibleUntil.getTime() > now
            ? record.refundEligibleUntil
            : null;

    const isPastDue = record?.subscriptionStatus === "past_due";

    return (
        <div className="space-y-6">
            {isPastDue ? <PastDueBanner workspaceId={workspaceId} /> : null}
            <DashboardSection label="Billing">
                <p className="text-sm text-muted-foreground">
                    {hasActiveSubscription
                        ? "Your workspace is on Bursora cloud. Manage payment, invoices, or cancel from the billing portal."
                        : "Upgrade to Bursora cloud for managed enforcement, alerts, and dashboards."}
                </p>
                <div className="mt-4 space-y-3">
                    {status === "ok" ? (
                        <p className="text-sm text-success">Subscription updated.</p>
                    ) : null}
                    {status === "cancel" ? (
                        <p className="text-sm text-muted-foreground">Checkout cancelled.</p>
                    ) : null}

                    {hasProviderCustomer ? (
                        <form action={openPortalAction}>
                            <input type="hidden" name="workspaceId" value={workspaceId} />
                            <Button type="submit" variant="secondary">
                                Manage billing
                            </Button>
                        </form>
                    ) : null}
                    {!hasActiveSubscription ? (
                        <form action={createCheckoutAction}>
                            <input type="hidden" name="workspaceId" value={workspaceId} />
                            <Button type="submit">Upgrade to Bursora cloud</Button>
                        </form>
                    ) : null}
                </div>
            </DashboardSection>
            {refundEligibleUntil ? (
                <RefundPanel
                    workspaceId={workspaceId}
                    eligibleUntil={refundEligibleUntil}
                    canRequest={isOwner}
                />
            ) : null}
            {hasActiveSubscription ? <NextBillEstimate workspaceId={workspaceId} /> : null}
        </div>
    );
}
