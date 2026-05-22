import type {
    CheckoutSessionInput,
    CheckoutSessionResult,
    PortalSessionInput,
    PortalSessionResult,
    PushInvoiceInput,
    PushInvoiceResult,
    RefundAllInvoicesInput,
    RefundAllInvoicesResult,
    StripeAdapter,
    StripeWebhookEvent,
} from "@/lib/ee/billing";

interface FakePaidInvoice {
    readonly invoiceId: string;
    readonly amountCents: number;
}

export class FakeStripeAdapter implements StripeAdapter {
    public readonly checkoutCalls: CheckoutSessionInput[] = [];
    public readonly portalCalls: PortalSessionInput[] = [];
    public readonly invoiceCalls: PushInvoiceInput[] = [];
    public readonly refundCalls: RefundAllInvoicesInput[] = [];
    public readonly cancelCalls: { subscriptionId: string }[] = [];

    public nextCheckoutResult: CheckoutSessionResult = {
        id: "cs_test_default",
        url: "https://stripe.test/checkout/cs_test_default",
    };
    public nextPortalResult: PortalSessionResult = {
        url: "https://stripe.test/portal/default",
    };
    public nextInvoiceId = "in_test_default";
    public pushInvoiceShouldThrow = false;
    public nextEvent: StripeWebhookEvent | null = null;
    public verifyShouldThrow = false;
    public refundShouldThrow = false;
    public cancelSubscriptionShouldThrow = false;
    // Per-customer paid-invoice ledger. Refunds drain it so subsequent calls
    // return a zero-invoice result and the use-case can flag idempotency.
    public readonly paidInvoicesByCustomer = new Map<string, FakePaidInvoice[]>();

    seedPaidInvoices(customerId: string, invoices: readonly FakePaidInvoice[]): void {
        this.paidInvoicesByCustomer.set(customerId, [...invoices]);
    }

    async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
        this.checkoutCalls.push(input);
        return this.nextCheckoutResult;
    }

    async createPortalSession(input: PortalSessionInput): Promise<PortalSessionResult> {
        this.portalCalls.push(input);
        return this.nextPortalResult;
    }

    public readonly verifyCalls: { rawBody: string; signatureHeader: string }[] = [];

    verifyAndParseEvent(input: { rawBody: string; signatureHeader: string }): StripeWebhookEvent {
        this.verifyCalls.push(input);
        if (this.verifyShouldThrow) {
            throw new Error("invalid signature");
        }
        if (this.nextEvent === null) {
            throw new Error("FakeStripeAdapter: nextEvent not set");
        }
        return this.nextEvent;
    }

    async pushInvoice(input: PushInvoiceInput): Promise<PushInvoiceResult> {
        this.invoiceCalls.push(input);
        if (this.pushInvoiceShouldThrow) {
            throw new Error("stripe.pushInvoice forced failure");
        }
        const invoiceId = `${this.nextInvoiceId}_${this.invoiceCalls.length}`;
        return { invoiceId };
    }

    async refundAllInvoices(input: RefundAllInvoicesInput): Promise<RefundAllInvoicesResult> {
        this.refundCalls.push(input);
        if (this.refundShouldThrow) {
            throw new Error("stripe.refundAllInvoices forced failure");
        }
        const invoices = this.paidInvoicesByCustomer.get(input.customerId) ?? [];
        const totalCents = invoices.reduce((sum, inv) => sum + inv.amountCents, 0);
        const refundedInvoiceIds = invoices.map((inv) => inv.invoiceId);
        // Drain the ledger to mirror Stripe's behaviour: a second call against
        // the same customer finds no further paid invoices to refund.
        this.paidInvoicesByCustomer.set(input.customerId, []);
        return { refundedInvoiceIds, totalCents };
    }

    async cancelSubscription(input: { subscriptionId: string }): Promise<void> {
        this.cancelCalls.push(input);
        if (this.cancelSubscriptionShouldThrow) {
            throw new Error("stripe.cancelSubscription forced failure");
        }
    }
}
