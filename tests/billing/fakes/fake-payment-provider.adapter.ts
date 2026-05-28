import type {
    CheckoutSessionInput,
    CheckoutSessionResult,
    PaymentProviderAdapter,
    PortalSessionInput,
    PortalSessionResult,
    RefundAllOrdersInput,
    RefundAllOrdersResult,
    ReportUsageInput,
    ReportUsageResult,
    VerifyCredentialsResult,
    WebhookEvent,
} from "@/lib/ee/billing";

interface FakePaidOrder {
    readonly orderId: string;
    readonly amountCents: number;
}

export class FakePaymentProviderAdapter implements PaymentProviderAdapter {
    public readonly checkoutCalls: CheckoutSessionInput[] = [];
    public readonly portalCalls: PortalSessionInput[] = [];
    public readonly reportUsageCalls: ReportUsageInput[] = [];
    public readonly refundCalls: RefundAllOrdersInput[] = [];
    public readonly cancelCalls: { subscriptionId: string }[] = [];

    public nextCheckoutResult: CheckoutSessionResult = {
        id: "cs_test_default",
        url: "https://provider.test/checkout/cs_test_default",
    };
    public nextPortalResult: PortalSessionResult = {
        url: "https://provider.test/portal/default",
    };
    public nextUsageRecordId = "usage_rec_default";
    public reportUsageShouldThrow = false;
    public nextEvent: WebhookEvent | null = null;
    public verifyShouldThrow = false;
    public refundShouldThrow = false;
    public cancelSubscriptionShouldThrow = false;
    // Per-customer paid-order ledger. Refunds drain it so subsequent calls
    // return a zero-order result and the use-case can flag idempotency.
    public readonly paidOrdersByCustomer = new Map<string, FakePaidOrder[]>();

    seedPaidOrders(customerId: string, orders: readonly FakePaidOrder[]): void {
        this.paidOrdersByCustomer.set(customerId, [...orders]);
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

    verifyAndParseEvent(input: { rawBody: string; signatureHeader: string }): WebhookEvent {
        this.verifyCalls.push(input);
        if (this.verifyShouldThrow) {
            throw new Error("invalid signature");
        }
        if (this.nextEvent === null) {
            throw new Error("FakePaymentProviderAdapter: nextEvent not set");
        }
        return this.nextEvent;
    }

    async reportUsage(input: ReportUsageInput): Promise<ReportUsageResult> {
        this.reportUsageCalls.push(input);
        if (this.reportUsageShouldThrow) {
            throw new Error("reportUsage forced failure");
        }
        const usageRecordId = `${this.nextUsageRecordId}_${this.reportUsageCalls.length}`;
        return { usageRecordId };
    }

    async refundAllOrders(input: RefundAllOrdersInput): Promise<RefundAllOrdersResult> {
        this.refundCalls.push(input);
        if (this.refundShouldThrow) {
            throw new Error("refundAllOrders forced failure");
        }
        const orders = this.paidOrdersByCustomer.get(input.customerId) ?? [];
        const totalCents = orders.reduce((sum, ord) => sum + ord.amountCents, 0);
        const refundedOrderIds = orders.map((ord) => ord.orderId);
        // Drain the ledger to mirror provider behaviour: a second call against
        // the same customer finds no further paid orders to refund.
        this.paidOrdersByCustomer.set(input.customerId, []);
        return { refundedOrderIds, totalCents };
    }

    async cancelSubscription(input: { subscriptionId: string }): Promise<void> {
        this.cancelCalls.push(input);
        if (this.cancelSubscriptionShouldThrow) {
            throw new Error("cancelSubscription forced failure");
        }
    }

    public verifyCredentialsCalls = 0;
    public verifyCredentialsResult: VerifyCredentialsResult = { ok: true };
    public verifyCredentialsShouldThrow = false;

    async verifyCredentials(): Promise<VerifyCredentialsResult> {
        this.verifyCredentialsCalls += 1;
        if (this.verifyCredentialsShouldThrow) {
            throw new Error("verifyCredentials forced failure");
        }
        return this.verifyCredentialsResult;
    }
}
