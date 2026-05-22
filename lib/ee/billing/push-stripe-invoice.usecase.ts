/**
 * Push a finalized invoice for one workspace's monthly bill.
 *
 * Composes two line items at most: the percentage component (always
 * present — the floor guarantees a positive amount) and the overage
 * component (omitted when zero). The Stripe adapter handles the actual
 * draft + finalize sequence; this use case is the thin orchestration
 * layer that turns a `BillCalculationResult` into a `PushInvoiceInput`.
 *
 * Returns the new Stripe invoice id so the caller can persist it on
 * the workspace billing state.
 */

import type { BillCalculationResult, StripeAdapter } from "./types";

export interface PushStripeInvoiceInput {
    readonly stripe: StripeAdapter;
    readonly customerId: string;
    readonly workspaceId: string;
    /** YYYY-MM. */
    readonly periodMonth: string;
    readonly bill: BillCalculationResult;
}

export interface PushStripeInvoiceResult {
    readonly invoiceId: string;
}

export async function pushStripeInvoiceUseCase(
    input: PushStripeInvoiceInput,
): Promise<PushStripeInvoiceResult> {
    const lineItems = [
        {
            description: `Cloud platform fee (0.5% tracked LLM spend, ${input.periodMonth})`,
            amountCents: input.bill.percentageCents,
        },
    ];
    if (input.bill.overageCents > 0) {
        lineItems.push({
            description: `Event overage (${input.periodMonth})`,
            amountCents: input.bill.overageCents,
        });
    }
    const result = await input.stripe.pushInvoice({
        customerId: input.customerId,
        workspaceId: input.workspaceId,
        periodMonth: input.periodMonth,
        lineItems,
    });
    return { invoiceId: result.invoiceId };
}
