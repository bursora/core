import type {
    CheckoutSessionInput,
    CheckoutSessionResult,
    PaymentProviderAdapter,
    PortalSessionInput,
    PortalSessionResult,
    VerifyCredentialsResult,
    WebhookEvent,
} from "@/lib/ee/billing";

export class FakePaymentProviderAdapter implements PaymentProviderAdapter {
    public readonly checkoutCalls: CheckoutSessionInput[] = [];
    public readonly portalCalls: PortalSessionInput[] = [];

    public nextCheckoutResult: CheckoutSessionResult = {
        id: "cs_test_default",
        url: "https://provider.test/checkout/cs_test_default",
    };
    public nextPortalResult: PortalSessionResult = {
        url: "https://provider.test/portal/default",
    };
    public nextEvent: WebhookEvent | null = null;
    public verifyShouldThrow = false;

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
