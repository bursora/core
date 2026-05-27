/**
 * Integration test for the monthly billing rollup. Wires the use case to
 * in-memory fakes for the LS payment provider + workspace + tracked-spend
 * + event-bundle rollup repos.
 *
 * Coverage:
 *   - happy path: one workspace, full month → usage record posted with totalCents = floor
 *   - overage rolled into totalCents when events exceed the bundle
 *   - cap clamps the percentage component
 *   - mid-month signup prorates the floor/cap
 *   - retry: month already billed → skipped (no provider call)
 *   - workspace with no provider customer → skipped
 *   - provider push failure → counted as failed, batch continues
 *   - persists usage-record id + month on success
 */

import { CAP_CENTS, FLOOR_CENTS } from "@/lib/ee/billing/calculate-bill";
import { rollupBillUseCase } from "@/lib/ee/billing/rollup-bill.usecase";
import { describe, expect, test } from "bun:test";
import { FakePaymentProviderAdapter } from "./fakes/fake-payment-provider.adapter";
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
        provider: new FakePaymentProviderAdapter(),
        workspaces: new InMemoryWorkspaceBillingRepository(),
        trackedSpend: new InMemoryTrackedSpendRepository(),
        eventBundleRollup: new InMemoryEventBundleRollupRepository(),
    };
}

describe("rollupBillUseCase", () => {
    test("reports the floor as totalCents when spend is light", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            providerCustomerId: "cus_a",
            providerSubscriptionId: "sub_a",
            subscriptionStatus: "active",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);
        deps.trackedSpend.seedSpend({ workspaceId: WORKSPACE_A, month: JAN_MONTH, cents: 0 });

        const result = await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        expect(result).toEqual({ month: JAN_MONTH, processed: 1, skipped: 0, failed: 0 });
        expect(deps.provider.reportUsageCalls).toHaveLength(1);
        const call = deps.provider.reportUsageCalls[0]!;
        expect(call.workspaceId).toBe(WORKSPACE_A);
        expect(call.periodMonth).toBe(JAN_MONTH);
        expect(call.subscriptionId).toBe("sub_a");
        expect(call.totalCents).toBe(FLOOR_CENTS);
    });

    test("rolls overage into totalCents when events exceed the bundle", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            providerCustomerId: "cus_a",
            providerSubscriptionId: "sub_a",
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

        const call = deps.provider.reportUsageCalls[0]!;
        expect(call.totalCents).toBe(5000 + 300);
    });

    test("caps the percentage component at $499", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            providerCustomerId: "cus_a",
            providerSubscriptionId: "sub_a",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);
        deps.trackedSpend.seedSpend({
            workspaceId: WORKSPACE_A,
            month: JAN_MONTH,
            cents: 100_000_000,
        }); // $1M

        await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        const call = deps.provider.reportUsageCalls[0]!;
        expect(call.totalCents).toBe(CAP_CENTS);
    });

    test("prorates the floor for a mid-month signup", async () => {
        const deps = buildDeps();
        // Signed up Jan 17 of a 31-day month → 15 days active (17..31). Floor =
        // round(2900 * 15/31) = 1403c.
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            providerCustomerId: "cus_a",
            providerSubscriptionId: "sub_a",
            subscribedAt: new Date("2025-01-17T12:00:00Z"),
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);
        deps.trackedSpend.seedSpend({ workspaceId: WORKSPACE_A, month: JAN_MONTH, cents: 0 });

        await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        const expectedFloor = Math.round(FLOOR_CENTS * (15 / 31));
        const call = deps.provider.reportUsageCalls[0]!;
        expect(call.totalCents).toBe(expectedFloor);
    });

    test("skips workspaces already invoiced for the period (retry-safe)", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            providerCustomerId: "cus_a",
            providerSubscriptionId: "sub_a",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
            lastBilledMonth: JAN_MONTH,
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);
        deps.trackedSpend.seedSpend({ workspaceId: WORKSPACE_A, month: JAN_MONTH, cents: 0 });

        const result = await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        expect(result).toEqual({ month: JAN_MONTH, processed: 0, skipped: 1, failed: 0 });
        expect(deps.provider.reportUsageCalls).toHaveLength(0);
    });

    test("skips workspaces whose subscription is canceled (post-refund, no further usage reported)", async () => {
        // LS cancels at end-of-period. After a refund we mark the workspace
        // canceled in our DB and must NOT report further usage for it — even
        // if tracked spend keeps accruing during the leftover days.
        const deps = buildDeps();
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            providerCustomerId: "cus_a",
            providerSubscriptionId: "sub_a",
            subscriptionStatus: "canceled",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);
        deps.trackedSpend.seedSpend({
            workspaceId: WORKSPACE_A,
            month: JAN_MONTH,
            cents: 1_000_000,
        });

        const result = await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        expect(result.skipped).toBe(1);
        expect(result.processed).toBe(0);
        expect(deps.provider.reportUsageCalls).toHaveLength(0);
    });

    test("skips workspaces without a provider customer", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({ workspaceId: WORKSPACE_A, providerCustomerId: null });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);

        const result = await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        expect(result.skipped).toBe(1);
        expect(deps.provider.reportUsageCalls).toHaveLength(0);
    });

    test("provider failure counts the workspace as failed but does not halt the batch", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            providerCustomerId: "cus_a",
            providerSubscriptionId: "sub_a",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
        });
        deps.workspaces.seed({
            workspaceId: WORKSPACE_B,
            providerCustomerId: "cus_b",
            providerSubscriptionId: "sub_b",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A, WORKSPACE_B]);
        deps.provider.reportUsageShouldThrow = true;

        const result = await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        expect(result.failed).toBe(2);
        expect(result.processed).toBe(0);
    });

    test("persists usage-record id + month on success", async () => {
        const deps = buildDeps();
        deps.workspaces.seed({
            workspaceId: WORKSPACE_A,
            providerCustomerId: "cus_a",
            providerSubscriptionId: "sub_a",
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
        });
        deps.trackedSpend.seedActiveIds([WORKSPACE_A]);
        deps.provider.nextUsageRecordId = "usage_jan_a";

        await rollupBillUseCase({ now: FEB_FIRST, ...deps });

        const record = await deps.workspaces.findById(WORKSPACE_A);
        expect(record?.lastInvoiceRef).toBe("usage_jan_a_1");
        expect(record?.lastBilledMonth).toBe(JAN_MONTH);
    });
});
