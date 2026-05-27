/**
 * Report one workspace's monthly usage to the upstream payment provider.
 *
 * The bill is computed in cents; the LS adapter converts it to usage units
 * (1 unit = $0.50) before posting the usage record. The adapter handles the
 * JSON:API call shape; this use case is the thin orchestration layer that:
 *
 *   - Short-circuits when the workspace's `lastBilledMonth` already
 *     matches the requested period (a retried cron skipping work it
 *     already finished).
 *   - Calls `provider.reportUsage` with the bill total.
 *   - Persists the returned usage-record id on `lastInvoiceRef` so the
 *     dashboard can deep-link and the next retry detects the period
 *     was already reported.
 *
 * Failure semantics: provider exceptions propagate. The caller (cron
 * loop) isolates one workspace's failure from the rest.
 */

import type { BillCalculationResult, PaymentProviderAdapter } from "./types";
import type { WorkspaceBillingRepository } from "./workspace-billing.repository";

export interface ReportUsageUseCaseInput {
    readonly provider: PaymentProviderAdapter;
    readonly workspaces: WorkspaceBillingRepository;
    readonly workspaceId: string;
    /** YYYY-MM. */
    readonly periodMonth: string;
    readonly bill: BillCalculationResult;
}

export type ReportUsageUseCaseResult =
    | { readonly skipped: false; readonly usageRecordId: string }
    | { readonly skipped: true };

export async function reportUsageUseCase(
    input: ReportUsageUseCaseInput,
): Promise<ReportUsageUseCaseResult> {
    const record = await input.workspaces.findById(input.workspaceId);
    if (!record) {
        throw new Error(`workspace not found: ${input.workspaceId}`);
    }
    if (record.lastBilledMonth === input.periodMonth) {
        return { skipped: true };
    }
    if (record.providerSubscriptionId === null) {
        throw new Error(
            `workspace ${input.workspaceId} has no subscription on file; cannot report usage`,
        );
    }

    const { usageRecordId } = await input.provider.reportUsage({
        subscriptionId: record.providerSubscriptionId,
        workspaceId: input.workspaceId,
        periodMonth: input.periodMonth,
        totalCents: input.bill.totalCents,
    });

    await input.workspaces.update({
        workspaceId: input.workspaceId,
        lastInvoiceRef: usageRecordId,
        lastBilledMonth: input.periodMonth,
    });

    return { skipped: false, usageRecordId };
}
