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

import { SubmitButton } from "@/components/ui/submit-button";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { StatusTag, type StatusTagTone } from "@/components/ui/workspace/status-tag";
import { isActiveSubscriptionStatus } from "@/lib/billing-status";
import { getOnboardingPlan } from "@/lib/onboarding/plan-view";
import { getRequestTimeZone } from "@/lib/time/request-tz";
import { Check, Zap } from "lucide-react";
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
    const [record, plan] = await Promise.all([getUserBillingRecord(userId), getOnboardingPlan()]);
    // Portal button: show whenever the user has a provider customer on file,
    // even if the subscription is cancelled. Lemon Squeezy's portal lets the
    // user see invoices and re-subscribe, so the entry point is useful beyond
    // active status.
    const hasProviderCustomer = record?.providerCustomerId != null;
    const hasActiveSubscription =
        hasProviderCustomer && isActiveSubscriptionStatus(record?.subscriptionStatus);
    // eslint-disable-next-line react-hooks/purity -- server-rendered once per request; current time is the eligibility cutoff
    const now = Date.now();
    const tz = await getRequestTimeZone();
    const refundEligibleUntil =
        record?.refundEligibleUntil && record.refundEligibleUntil.getTime() > now
            ? record.refundEligibleUntil
            : null;

    const isPastDue = record?.subscriptionStatus === "past_due";
    const pill = STATUS_PILL[record?.subscriptionStatus ?? ""] ?? INACTIVE_PILL;

    // Show the price for the plan the user actually bought (monthly vs annual),
    // matched by the variant id on their subscription. Falls back to the monthly
    // headline before checkout, and for legacy rows with no variant on file.
    const subscribed = [plan?.monthly, plan?.annual].find(
        (p) => p != null && p.variantId === record?.providerVariantId,
    );
    const displayPrice = subscribed ?? plan?.monthly ?? null;

    return (
        <div className="space-y-6">
            {isPastDue ? <PastDueBanner /> : null}
            <DashboardSection label="Billing">
                {plan || hasProviderCustomer ? (
                    <div className="rounded-[8px] border bg-background p-4 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-semibold tracking-[-0.01em]">
                                        {plan?.name ?? "Bursora Cloud"}
                                    </h3>
                                    <StatusTag tone={pill.tone} variant="pill">
                                        {pill.label}
                                    </StatusTag>
                                </div>
                                {displayPrice ? (
                                    <p className="flex items-baseline gap-1.5">
                                        <span className="text-2xl font-semibold tabular-nums">
                                            {displayPrice.price}
                                        </span>
                                        <span className="text-sm text-muted-foreground">
                                            / {displayPrice.interval}
                                        </span>
                                    </p>
                                ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {hasProviderCustomer ? (
                                    <form action={openPortalAction}>
                                        <SubmitButton pendingLabel="Opening portal…">
                                            Manage billing
                                        </SubmitButton>
                                    </form>
                                ) : null}
                                {!hasActiveSubscription ? (
                                    <form action={createCheckoutAction}>
                                        <input type="hidden" name="interval" value="month" />
                                        <SubmitButton pendingLabel="Opening checkout…">
                                            Upgrade to Bursora cloud
                                        </SubmitButton>
                                    </form>
                                ) : null}
                            </div>
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">
                            {hasActiveSubscription
                                ? "Managed enforcement, alerts, and dashboards. Update payment, view invoices, or cancel anytime from the billing portal."
                                : "Managed enforcement, alerts, and dashboards for your whole team. One flat price, cancel anytime."}
                        </p>
                        {!hasActiveSubscription ? (
                            <div className="mt-4 flex items-center gap-2 rounded-[8px] border border-success/25 bg-success/[0.06] px-3 py-2.5">
                                <Zap className="size-3.5 shrink-0 text-success" strokeWidth={2.4} />
                                <span className="font-mono text-[12px] leading-snug text-foreground/80">
                                    Pays for itself the first night it blocks a runaway.
                                </span>
                            </div>
                        ) : null}
                        {plan && plan.features.length > 0 ? (
                            <ul className="mt-4 flex flex-col gap-2">
                                {plan.features.map((feature) => (
                                    <li
                                        key={feature}
                                        className="flex items-start gap-2 text-sm text-foreground/90"
                                    >
                                        <Check
                                            aria-hidden
                                            className="mt-0.5 size-4 shrink-0 text-success"
                                        />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ) : null}
                {status === "ok" ? (
                    <p className="mt-3 text-sm text-success">Subscription updated.</p>
                ) : null}
                {status === "cancel" ? (
                    <p className="mt-3 text-sm text-muted-foreground">Checkout cancelled.</p>
                ) : null}
            </DashboardSection>
            {children}
            {refundEligibleUntil ? (
                <RefundPanel eligibleUntil={refundEligibleUntil} tz={tz} />
            ) : null}
        </div>
    );
}
