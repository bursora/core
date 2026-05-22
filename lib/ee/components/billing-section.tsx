/**
 * Billing panel for /settings.
 *
 * Workspaces without a Stripe subscription see "Subscribe to Bursora cloud"
 * which opens Stripe Checkout. Active subscribers see "Manage subscription"
 * which opens the Customer Portal. The `?billing=ok|cancel` flag set on the
 * redirect back from Stripe surfaces a small confirmation line.
 *
 * `subscriptionStatus` mirrors the Stripe status verbatim. Anything other
 * than `null`/`incomplete` means the user has been through Checkout at
 * least once, so the Portal CTA replaces the Checkout CTA.
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
import { RefundPanel } from "./refund-panel";

interface BillingSectionProps {
    workspaceId: string;
    status: "ok" | "cancel" | null;
    isOwner: boolean;
}

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);

export async function BillingSection({ workspaceId, status, isOwner }: BillingSectionProps) {
    const record = await getWorkspaceBillingRecord(workspaceId);
    const hasSubscription =
        record?.stripeCustomerId !== null &&
        record?.stripeCustomerId !== undefined &&
        record?.subscriptionStatus !== null &&
        ACTIVE_STATUSES.has(record.subscriptionStatus ?? "");
    // eslint-disable-next-line react-hooks/purity -- server-rendered once per request; current time is the eligibility cutoff
    const now = Date.now();
    const refundEligibleUntil =
        record?.refundEligibleUntil && record.refundEligibleUntil.getTime() > now
            ? record.refundEligibleUntil
            : null;

    return (
        <div className="space-y-6">
            <DashboardSection label="Billing">
                <p className="text-sm text-muted-foreground">
                    {hasSubscription
                        ? "Your workspace is on Bursora cloud. Manage payment, invoices, or cancel from the Stripe portal."
                        : "Subscribe to Bursora cloud for managed enforcement, alerts, and dashboards."}
                </p>
                <div className="mt-4 space-y-3">
                    {status === "ok" ? (
                        <p className="text-sm text-success">Subscription updated.</p>
                    ) : null}
                    {status === "cancel" ? (
                        <p className="text-sm text-muted-foreground">Checkout cancelled.</p>
                    ) : null}

                    {hasSubscription ? (
                        <form action={openPortalAction}>
                            <input type="hidden" name="workspaceId" value={workspaceId} />
                            <Button type="submit" variant="secondary">
                                Manage subscription
                            </Button>
                        </form>
                    ) : (
                        <form action={createCheckoutAction}>
                            <input type="hidden" name="workspaceId" value={workspaceId} />
                            <Button type="submit">Subscribe to Bursora cloud</Button>
                        </form>
                    )}
                </div>
            </DashboardSection>
            {refundEligibleUntil ? (
                <RefundPanel
                    workspaceId={workspaceId}
                    eligibleUntil={refundEligibleUntil}
                    canRequest={isOwner}
                />
            ) : null}
            {hasSubscription ? <NextBillEstimate workspaceId={workspaceId} /> : null}
        </div>
    );
}
