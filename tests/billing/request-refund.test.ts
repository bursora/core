import { requestRefundUseCase } from "@/lib/ee/billing";
import { describe, expect, test } from "bun:test";
import { FakeStripeAdapter } from "./fakes/fake-stripe.adapter";
import { InMemoryWorkspaceBillingRepository } from "./fakes/in-memory-workspace-billing.repository";

const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";
const CUSTOMER_ID = "cus_refund_42";
const SUBSCRIPTION_ID = "sub_refund_42";

const NOW = new Date("2026-06-01T00:00:00Z");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const fromNow = (days: number): Date => new Date(NOW.getTime() + days * ONE_DAY_MS);

interface EligibleWorkspaceOptions {
    readonly customerId?: string | null;
    readonly subscriptionId?: string | null;
    readonly subscriptionStatus?: string | null;
    readonly refundEligibleUntil?: Date | null;
}

const seedEligibleWorkspace = (
    workspaces: InMemoryWorkspaceBillingRepository,
    options: EligibleWorkspaceOptions = {},
): void => {
    workspaces.seed({
        workspaceId: WORKSPACE_ID,
        stripeCustomerId: options.customerId === undefined ? CUSTOMER_ID : options.customerId,
        stripeSubscriptionId:
            options.subscriptionId === undefined ? SUBSCRIPTION_ID : options.subscriptionId,
        subscriptionStatus:
            options.subscriptionStatus === undefined ? "active" : options.subscriptionStatus,
        subscribedAt: fromNow(-5),
        refundEligibleUntil:
            options.refundEligibleUntil === undefined ? fromNow(25) : options.refundEligibleUntil,
    });
};

describe("requestRefundUseCase", () => {
    test("within eligibility window refunds invoices, cancels subscription, clears eligibility", async () => {
        const stripe = new FakeStripeAdapter();
        stripe.seedPaidInvoices(CUSTOMER_ID, [
            { invoiceId: "in_1", amountCents: 2900 },
            { invoiceId: "in_2", amountCents: 2900 },
        ]);
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces);

        const result = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            stripe,
            workspaces,
        });

        expect(result.status).toBe("refunded");
        expect(result.totalCents).toBe(5800);
        expect(result.refundedInvoiceIds).toEqual(["in_1", "in_2"]);

        expect(stripe.refundCalls).toHaveLength(1);
        expect(stripe.refundCalls[0]?.customerId).toBe(CUSTOMER_ID);
        expect(stripe.cancelCalls).toHaveLength(1);
        expect(stripe.cancelCalls[0]?.subscriptionId).toBe(SUBSCRIPTION_ID);

        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("canceled");
        expect(row?.refundEligibleUntil).toBeNull();
    });

    test("past eligibility window returns not_eligible and skips Stripe", async () => {
        const stripe = new FakeStripeAdapter();
        stripe.seedPaidInvoices(CUSTOMER_ID, [{ invoiceId: "in_1", amountCents: 2900 }]);
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces, { refundEligibleUntil: fromNow(-1) });

        const result = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            stripe,
            workspaces,
        });

        expect(result.status).toBe("not_eligible");
        expect(result.totalCents).toBe(0);
        expect(stripe.refundCalls).toHaveLength(0);
        expect(stripe.cancelCalls).toHaveLength(0);

        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("active");
        expect(row?.refundEligibleUntil?.getTime()).toBe(fromNow(-1).getTime());
    });

    test("null eligibility timestamp returns not_eligible", async () => {
        const stripe = new FakeStripeAdapter();
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces, { refundEligibleUntil: null });

        const result = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            stripe,
            workspaces,
        });

        expect(result.status).toBe("not_eligible");
        expect(stripe.refundCalls).toHaveLength(0);
    });

    test("missing Stripe customer returns no_invoices without touching Stripe", async () => {
        const stripe = new FakeStripeAdapter();
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces, { customerId: null, subscriptionId: null });

        const result = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            stripe,
            workspaces,
        });

        expect(result.status).toBe("no_invoices");
        expect(stripe.refundCalls).toHaveLength(0);
        expect(stripe.cancelCalls).toHaveLength(0);
    });

    test("customer with no paid invoices returns no_invoices and clears eligibility", async () => {
        const stripe = new FakeStripeAdapter();
        // Note: no seedPaidInvoices call — the customer exists but has no paid invoices.
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces);

        const result = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            stripe,
            workspaces,
        });

        expect(result.status).toBe("no_invoices");
        expect(result.totalCents).toBe(0);
        expect(stripe.refundCalls).toHaveLength(1);
        expect(stripe.cancelCalls).toHaveLength(0);

        const row = await workspaces.findById(WORKSPACE_ID);
        // Subscription stays active — there was no charge to refund.
        expect(row?.subscriptionStatus).toBe("active");
        expect(row?.refundEligibleUntil).toBeNull();
    });

    test("second call after a successful refund returns not_eligible", async () => {
        const stripe = new FakeStripeAdapter();
        stripe.seedPaidInvoices(CUSTOMER_ID, [{ invoiceId: "in_1", amountCents: 2900 }]);
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces);

        const first = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            stripe,
            workspaces,
        });
        expect(first.status).toBe("refunded");

        const second = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            stripe,
            workspaces,
        });
        expect(second.status).toBe("not_eligible");
        // refundAllInvoices was called once (first call); second short-circuits.
        expect(stripe.refundCalls).toHaveLength(1);
    });

    test("Stripe refund failure propagates as error and leaves workspace untouched", async () => {
        const stripe = new FakeStripeAdapter();
        stripe.seedPaidInvoices(CUSTOMER_ID, [{ invoiceId: "in_1", amountCents: 2900 }]);
        stripe.refundShouldThrow = true;
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces);

        await expect(
            requestRefundUseCase({
                workspaceId: WORKSPACE_ID,
                now: NOW,
                stripe,
                workspaces,
            }),
        ).rejects.toThrow(/forced failure/);

        const row = await workspaces.findById(WORKSPACE_ID);
        // Untouched: subscription still active, eligibility still set.
        expect(row?.subscriptionStatus).toBe("active");
        expect(row?.refundEligibleUntil?.getTime()).toBe(fromNow(25).getTime());
        expect(stripe.cancelCalls).toHaveLength(0);
    });

    test("subscription canceled mid-window still allows refund of paid invoices", async () => {
        const stripe = new FakeStripeAdapter();
        stripe.seedPaidInvoices(CUSTOMER_ID, [{ invoiceId: "in_1", amountCents: 2900 }]);
        const workspaces = new InMemoryWorkspaceBillingRepository();
        // Customer canceled through the Stripe portal but is still inside the
        // 30-day window. Refund eligibility is keyed off signup, not status.
        seedEligibleWorkspace(workspaces, { subscriptionStatus: "canceled" });

        const result = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            stripe,
            workspaces,
        });

        expect(result.status).toBe("refunded");
        expect(result.totalCents).toBe(2900);
        // cancelSubscription is still called — idempotent and harmless.
        expect(stripe.cancelCalls).toHaveLength(1);
        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.refundEligibleUntil).toBeNull();
    });

    test("throws when the workspace does not exist", async () => {
        const stripe = new FakeStripeAdapter();
        const workspaces = new InMemoryWorkspaceBillingRepository();

        await expect(
            requestRefundUseCase({
                workspaceId: "00000000-0000-0000-0000-000000000000",
                now: NOW,
                stripe,
                workspaces,
            }),
        ).rejects.toThrow();
    });
});
