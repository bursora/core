/**
 * Integration test for the monthly billing rollup. Wires the use case to
 * in-memory fakes for Stripe + workspace + tracked-spend + event-bundle
 * rollup repos.
 *
 * Coverage:
 *   - happy path: one workspace, full month → invoice with one line item
 *   - overage line item added when events exceed bundle
 *   - mid-month signup prorates the floor/cap
 *   - retry: month already billed → skipped
 *   - workspace with no Stripe customer → skipped
 *   - Stripe push failure → counted as failed, batch continues
 */

import { CAP_CENTS, FLOOR_CENTS } from "@/lib/ee/billing/calculate-bill";
import { rollupBillUseCase } from "@/lib/ee/billing/rollup-bill.usecase";
import { describe, expect, test } from "bun:test";
import { FakeStripeAdapter } from "./fakes/fake-stripe.adapter";
import { InMemoryEventBundleRollupRepository } from "./fakes/in-memory-event-bundle-rollup.repository";
import { InMemoryTrackedSpendRepository } from "./fakes/in-memory-tracked-spend.repository";
import { InMemoryWorkspaceBillingRepository } from "./fakes/in-memory-workspace-billing.repository";

const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "22222222-3333-4444-5555-666666666666";
// Run "now" = Feb 1, 2025; prior month = Jan 2025 (31 days).
const FEB_FIRST = new Date("2025-02-01T00:00:00Z");
const JAN_MONTH = "2025-01";

function buildDeps() {
    return {
        stripe: new FakeStripeAdapter(),
        workspaces: new InMemoryWorkspaceBillingRepository(),
        trackedSpend: new InMemoryTrackedSpendRepository(),
        eventBundleRollup: new InMemoryEventBundleRollupRepository(),
    };
}

describe("rollupBillUseCase", () => {
    test("pushes a single line item invoice with the floor when spend is light", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            stripeCustomerId: "cus_a",
            stripeSubscriptionId: "sub_a",
            subscriptionStatus: "active",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);
        deps.trackedSpend.seedSpend({ workspaceId: WORKSPACE_A, month: JAN_MONTH, cents: 0 });

        const result = await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        expect(result).toEqual({ month: JAN_MONTH, processed: 1, skipped: 0, failed: 0 });
        expect(deps.stripe.invoiceCalls).toHaveLength(1);
        const invoice = deps.stripe.invoiceCalls[0]!;
        expect(invoice.workspaceId).toBe(WORKSPACE_A);
        expect(invoice.periodMonth).toBe(JAN_MONTH);
        expect(invoice.lineItems).toHaveLength(1);
        expect(invoice.lineItems[0]?.amountCents).toBe(FLOOR_CENTS);
    });

    test("adds an overage line item when events exceed the bundle", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            stripeCustomerId: "cus_a",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);
        // $10K spend → percentage = $50 = 5000c
        deps.trackedSpend.seedSpend({
            workspaceId: WORKSPACE_A,
            month: JAN_MONTH,
            cents: 1_000_000,
        });
        deps.eventBundleRollup.seed({
            workspaceId: WORKSPACE_A,
            month: JAN_MONTH,
            eventsCount: 5_000_000 + 10_000, // +$3 overage
        });

        await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        const invoice = deps.stripe.invoiceCalls[0]!;
        expect(invoice.lineItems).toHaveLength(2);
        expect(invoice.lineItems[0]?.amountCents).toBe(5000);
        expect(invoice.lineItems[1]?.amountCents).toBe(300);
    });

    test("caps the percentage at $499", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            stripeCustomerId: "cus_a",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);
        deps.trackedSpend.seedSpend({
            workspaceId: WORKSPACE_A,
            month: JAN_MONTH,
            cents: 100_000_000,
        }); // $1M

        await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        const invoice = deps.stripe.invoiceCalls[0]!;
        expect(invoice.lineItems[0]?.amountCents).toBe(CAP_CENTS);
    });

    test("prorates the floor for a mid-month signup", async () => {
        const deps = buildDeps();
        // Signed up Jan 17 of a 31-day month → 15 days active (17..31). Floor =
        // round(2900 * 15/31) = 1403c.
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            stripeCustomerId: "cus_a",
            subscribedAt: new Date("2025-01-17T12:00:00Z"),
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);
        deps.trackedSpend.seedSpend({ workspaceId: WORKSPACE_A, month: JAN_MONTH, cents: 0 });

        await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        const expectedFloor = Math.round(FLOOR_CENTS * (15 / 31));
        const invoice = deps.stripe.invoiceCalls[0]!;
        expect(invoice.lineItems[0]?.amountCents).toBe(expectedFloor);
    });

    test("skips workspaces already invoiced for the period (retry-safe)", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            stripeCustomerId: "cus_a",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
            lastBilledMonth: JAN_MONTH,
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);
        deps.trackedSpend.seedSpend({ workspaceId: WORKSPACE_A, month: JAN_MONTH, cents: 0 });

        const result = await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        expect(result).toEqual({ month: JAN_MONTH, processed: 0, skipped: 1, failed: 0 });
        expect(deps.stripe.invoiceCalls).toHaveLength(0);
    });

    test("skips workspaces without a Stripe customer", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({ workspaceId: WORKSPACE_A, stripeCustomerId: null });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);

        const result = await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        expect(result.skipped).toBe(1);
        expect(deps.stripe.invoiceCalls).toHaveLength(0);
    });

    test("Stripe failure counts the workspace as failed but does not halt the batch", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            stripeCustomerId: "cus_a",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
        });
        deps.workspaces.seed({
            workspaceId: WORKSPACE_B,
            stripeCustomerId: "cus_b",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A, WORKSPACE_B]);
        deps.stripe.pushInvoiceShouldThrow = true;

        const result = await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        expect(result.failed).toBe(2);
        expect(result.processed).toBe(0);
    });

    test("persists invoice id + month on success", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            stripeCustomerId: "cus_a",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);
        deps.stripe.nextInvoiceId = "in_jan_a";

        await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        const record = await deps.workspaces.findById(WORKSPACE_A);
        expect(record?.lastInvoiceId).toBe("in_jan_a_1");
        expect(record?.lastBilledMonth).toBe(JAN_MONTH);
    });
});
