import { requestRefundUseCase } from "@/lib/ee/billing";
import { describe, expect, test } from "bun:test";
import { FakePaymentProviderAdapter } from "./fakes/fake-payment-provider.adapter";
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
        providerCustomerId: options.customerId === undefined ? CUSTOMER_ID : options.customerId,
        providerSubscriptionId:
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
        const provider = new FakePaymentProviderAdapter();
        provider.seedPaidOrders(CUSTOMER_ID, [
            { orderId: "in_1", amountCents: 2900 },
            { orderId: "in_2", amountCents: 2900 },
        ]);
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces);

        const result = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            provider,
            workspaces,
        });

        expect(result.status).toBe("refunded");
        expect(result.totalCents).toBe(5800);
        expect(result.refundedOrderIds).toEqual(["in_1", "in_2"]);

        expect(provider.refundCalls).toHaveLength(1);
        expect(provider.refundCalls[0]?.customerId).toBe(CUSTOMER_ID);
        expect(provider.cancelCalls).toHaveLength(1);
        expect(provider.cancelCalls[0]?.subscriptionId).toBe(SUBSCRIPTION_ID);

        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("canceled");
        expect(row?.refundEligibleUntil).toBeNull();
    });

    test("past eligibility window returns not_eligible and skips the provider", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.seedPaidOrders(CUSTOMER_ID, [{ orderId: "in_1", amountCents: 2900 }]);
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces, { refundEligibleUntil: fromNow(-1) });

        const result = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            provider,
            workspaces,
        });

        expect(result.status).toBe("not_eligible");
        expect(result.totalCents).toBe(0);
        expect(provider.refundCalls).toHaveLength(0);
        expect(provider.cancelCalls).toHaveLength(0);

        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("active");
        expect(row?.refundEligibleUntil?.getTime()).toBe(fromNow(-1).getTime());
    });

    test("null eligibility timestamp returns not_eligible", async () => {
        const provider = new FakePaymentProviderAdapter();
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces, { refundEligibleUntil: null });

        const result = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            provider,
            workspaces,
        });

        expect(result.status).toBe("not_eligible");
        expect(provider.refundCalls).toHaveLength(0);
    });

    test("missing provider customer returns no_invoices without touching the provider", async () => {
        const provider = new FakePaymentProviderAdapter();
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces, { customerId: null, subscriptionId: null });

        const result = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            provider,
            workspaces,
        });

        expect(result.status).toBe("no_invoices");
        expect(provider.refundCalls).toHaveLength(0);
        expect(provider.cancelCalls).toHaveLength(0);
    });

    test("customer with no paid orders returns no_invoices, clears eligibility, and marks subscription canceled", async () => {
        const provider = new FakePaymentProviderAdapter();
        // Note: no seedPaidOrders call — the customer exists but has no paid orders.
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces);

        const result = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            provider,
            workspaces,
        });

        expect(result.status).toBe("no_invoices");
        expect(result.totalCents).toBe(0);
        expect(provider.refundCalls).toHaveLength(1);
        // Cancel runs first (cancel-then-refund), so it's called even when
        // there's nothing to refund.
        expect(provider.cancelCalls).toHaveLength(1);

        const row = await workspaces.findById(WORKSPACE_ID);
        // We told LS to cancel the subscription; mirror that in the DB so the
        // rollup cron skips this workspace going forward. Otherwise the
        // subscription stays `active` here while LS-side cancellation rides
        // out the period — and the rollup would happily push usage records
        // through the leftover days.
        expect(row?.subscriptionStatus).toBe("canceled");
        expect(row?.refundEligibleUntil).toBeNull();
    });

    test("second call after a successful refund returns not_eligible", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.seedPaidOrders(CUSTOMER_ID, [{ orderId: "in_1", amountCents: 2900 }]);
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces);

        const first = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            provider,
            workspaces,
        });
        expect(first.status).toBe("refunded");

        const second = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            provider,
            workspaces,
        });
        expect(second.status).toBe("not_eligible");
        // refundAllOrders was called once (first call); second short-circuits.
        expect(provider.refundCalls).toHaveLength(1);
    });

    test("provider refund failure propagates as error and leaves workspace untouched", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.seedPaidOrders(CUSTOMER_ID, [{ orderId: "in_1", amountCents: 2900 }]);
        provider.refundShouldThrow = true;
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedEligibleWorkspace(workspaces);

        await expect(
            requestRefundUseCase({
                workspaceId: WORKSPACE_ID,
                now: NOW,
                provider,
                workspaces,
            }),
        ).rejects.toThrow(/forced failure/);

        const row = await workspaces.findById(WORKSPACE_ID);
        // Untouched: workspace row not flipped, eligibility window still set.
        // The cancel ran first (and is idempotent on retry) — that's the
        // safety guarantee documented on the use case.
        expect(row?.subscriptionStatus).toBe("active");
        expect(row?.refundEligibleUntil?.getTime()).toBe(fromNow(25).getTime());
    });

    test("subscription canceled mid-window still allows refund of paid invoices", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.seedPaidOrders(CUSTOMER_ID, [{ orderId: "in_1", amountCents: 2900 }]);
        const workspaces = new InMemoryWorkspaceBillingRepository();
        // Customer canceled through the provider portal but is still inside the
        // 30-day window. Refund eligibility is keyed off signup, not status.
        seedEligibleWorkspace(workspaces, { subscriptionStatus: "canceled" });

        const result = await requestRefundUseCase({
            workspaceId: WORKSPACE_ID,
            now: NOW,
            provider,
            workspaces,
        });

        expect(result.status).toBe("refunded");
        expect(result.totalCents).toBe(2900);
        // cancelSubscription is still called — idempotent and harmless.
        expect(provider.cancelCalls).toHaveLength(1);
        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.refundEligibleUntil).toBeNull();
    });

    test("throws when the workspace does not exist", async () => {
        const provider = new FakePaymentProviderAdapter();
        const workspaces = new InMemoryWorkspaceBillingRepository();

        await expect(
            requestRefundUseCase({
                workspaceId: "00000000-0000-0000-0000-000000000000",
                now: NOW,
                provider,
                workspaces,
            }),
        ).rejects.toThrow();
    });
});
