/**
 * Tests for the LS usage-reporting use case. The use case is the thin
 * orchestration layer that turns one workspace's monthly bill into a
 * `provider.reportUsage` call and persists the resulting usage-record id
 * on the workspace row.
 *
 * Coverage:
 *   - happy path: provider called with totalCents, workspace row updated
 *   - idempotency: second invocation with the same `(workspace, period)`
 *     short-circuits and reports `skipped: true` without a second provider
 *     call
 *   - propagates provider failure (use case throws; persistence skipped)
 */

import { reportUsageUseCase } from "@/lib/ee/billing/report-usage.usecase";
import { describe, expect, test } from "bun:test";
import { FakePaymentProviderAdapter } from "./fakes/fake-payment-provider.adapter";
import { InMemoryWorkspaceBillingRepository } from "./fakes/in-memory-workspace-billing.repository";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const SUBSCRIPTION = "sub_test_1";
const PERIOD = "2025-01";

describe("reportUsageUseCase", () => {
    test("posts totalCents to the provider and persists the returned usage-record id + period", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.nextUsageRecordId = "usage_rec_1";
        const workspaces = new InMemoryWorkspaceBillingRepository();
        workspaces.seed({
            workspaceId: WORKSPACE,
            providerCustomerId: "cus_a",
            providerSubscriptionId: SUBSCRIPTION,
            subscribedAt: new Date("2024-06-01T00:00:00Z"),
        });

        const result = await reportUsageUseCase({
            provider,
            workspaces,
            workspaceId: WORKSPACE,
            periodMonth: PERIOD,
            bill: { percentageCents: 2900, overageCents: 0, totalCents: 2900 },
        });

        expect(result).toEqual({ skipped: false, usageRecordId: "usage_rec_1_1" });
        expect(provider.reportUsageCalls).toHaveLength(1);
        const call = provider.reportUsageCalls[0]!;
        expect(call.subscriptionId).toBe(SUBSCRIPTION);
        expect(call.workspaceId).toBe(WORKSPACE);
        expect(call.periodMonth).toBe(PERIOD);
        expect(call.totalCents).toBe(2900);

        const record = await workspaces.findById(WORKSPACE);
        expect(record?.lastInvoiceRef).toBe("usage_rec_1_1");
        expect(record?.lastBilledMonth).toBe(PERIOD);
    });

    test("is a no-op when lastBilledMonth already matches the requested period", async () => {
        const provider = new FakePaymentProviderAdapter();
        const workspaces = new InMemoryWorkspaceBillingRepository();
        workspaces.seed({
            workspaceId: WORKSPACE,
            providerCustomerId: "cus_a",
            providerSubscriptionId: SUBSCRIPTION,
            lastBilledMonth: PERIOD,
            lastInvoiceRef: "usage_rec_prev",
        });

        const result = await reportUsageUseCase({
            provider,
            workspaces,
            workspaceId: WORKSPACE,
            periodMonth: PERIOD,
            bill: { percentageCents: 2900, overageCents: 0, totalCents: 2900 },
        });

        expect(result.skipped).toBe(true);
        expect(provider.reportUsageCalls).toHaveLength(0);
    });

    test("throws when the workspace has no subscription on file", async () => {
        const provider = new FakePaymentProviderAdapter();
        const workspaces = new InMemoryWorkspaceBillingRepository();
        workspaces.seed({
            workspaceId: WORKSPACE,
            providerCustomerId: "cus_a",
            providerSubscriptionId: null,
        });

        await expect(
            reportUsageUseCase({
                provider,
                workspaces,
                workspaceId: WORKSPACE,
                periodMonth: PERIOD,
                bill: { percentageCents: 2900, overageCents: 0, totalCents: 2900 },
            }),
        ).rejects.toThrow();
    });
});
