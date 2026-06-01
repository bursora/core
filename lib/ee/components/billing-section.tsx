/**
 * Account billing panel for /settings.
 *
 * Billing is account-level: it reflects the signed-in user's Bursora Cloud
 * subscription, which gates every workspace they own. A user with no provider
 * customer on file sees "Upgrade to Bursora cloud" which opens Lemon Squeezy
 * checkout. Once a customer record exists (any status), a "Manage billing"
 * button opens the LS customer portal where they can update payment, view
 * invoices, or cancel. A lapsed/cancelled subscription shows both buttons. The
 * `?billing=ok|cancel` flag set on the redirect back from LS surfaces a small
 * confirmation line.
 *
 * The money-back guarantee panel renders only while
 * `refund_eligible_until` is set and in the future. It survives subscription
 * cancellation: a customer who cancels through the portal mid-window can
 * still claim a refund on the charges they already paid.
 */

import { Button } from "@/components/ui/button";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { StatusTag, type StatusTagTone } from "@/components/ui/workspace/status-tag";
import { isActiveSubscriptionStatus } from "@/lib/billing-status";
import type { ReactNode } from "react";
import { createCheckoutAction, openPortalAction } from "../billing-actions";
import { getUserBillingRecord } from "../billing/server";
import { PastDueBanner } from "./past-due-banner";
import { RefundPanel } from "./refund-panel";

interface BillingSectionProps {
    userId: string;
    status: "ok" | "cancel" | null;
    /** Rendered between the plan card and the money-back panel — the usage section. */
    children?: ReactNode;
}

const STATUS_PILL: Record<string, { label: string; tone: StatusTagTone }> = {
    active: { label: "Active", tone: "success" },
    past_due: { label: "Past due", tone: "destructive" },
    unpaid: { label: "Past due", tone: "destructive" },
};

const INACTIVE_PILL = { label: "Inactive", tone: "muted" } as const;

export async function BillingSection({ userId, status, children }: BillingSectionProps) {
    const record = await getUserBillingRecord(userId);
    // Portal button: show whenever the user has a provider customer on file,
    // even if the subscription is cancelled. Lemon Squeezy's portal lets the
    // user see invoices and re-subscribe, so the entry point is useful beyond
    // active status.
    const hasProviderCustomer = record?.providerCustomerId != null;
    const hasActiveSubscription =
        hasProviderCustomer && isActiveSubscriptionStatus(record?.subscriptionStatus);
    // eslint-disable-next-line react-hooks/purity -- server-rendered once per request; current time is the eligibility cutoff
    const now = Date.now();
    const refundEligibleUntil =
        record?.refundEligibleUntil && record.refundEligibleUntil.getTime() > now
            ? record.refundEligibleUntil
            : null;

    const isPastDue = record?.subscriptionStatus === "past_due";
    const pill = STATUS_PILL[record?.subscriptionStatus ?? ""] ?? INACTIVE_PILL;

    return (
        <div className="space-y-6">
            {isPastDue ? <PastDueBanner /> : null}
            <DashboardSection label="Billing">
                <div className="rounded-md border border-border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-semibold tracking-[-0.01em]">
                                    Bursora Cloud
                                </h3>
                                <StatusTag tone={pill.tone} variant="pill">
                                    {pill.label}
                                </StatusTag>
                            </div>
                            <p className="font-mono text-sm tabular-nums">
                                <span className="font-semibold">$29</span>
                                <span className="text-muted-foreground"> / month</span>
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {hasProviderCustomer ? (
                                <form action={openPortalAction}>
                                    <Button type="submit">Manage billing</Button>
                                </form>
                            ) : null}
                            {!hasActiveSubscription ? (
                                <form action={createCheckoutAction}>
                                    <Button type="submit">Upgrade to Bursora cloud</Button>
                                </form>
                            ) : null}
                        </div>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                        {hasActiveSubscription
                            ? "Managed enforcement, alerts, and dashboards. Update payment, view invoices, or cancel anytime from the billing portal."
                            : "Managed enforcement, alerts, and dashboards for your whole team. One flat price, cancel anytime."}
                    </p>
                </div>
                {status === "ok" ? (
                    <p className="mt-3 text-sm text-success">Subscription updated.</p>
                ) : null}
                {status === "cancel" ? (
                    <p className="mt-3 text-sm text-muted-foreground">Checkout cancelled.</p>
                ) : null}
            </DashboardSection>
            {children}
            {refundEligibleUntil ? <RefundPanel eligibleUntil={refundEligibleUntil} /> : null}
        </div>
    );
}
