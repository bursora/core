/**
 * Real Stripe SDK adapter. Constructed in `lib/billing/server.ts` with the
 * server-side secret + webhook secret. Routes never see Stripe types
 * directly — they pass `rawBody` + `signatureHeader` and consume the
 * narrow `StripeWebhookEvent` projection from `lib/billing/types`.
 */

import Stripe from "stripe";
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
    VerifyEventInput,
} from "./types";

export interface StripeApiAdapterConfig {
    readonly secretKey: string;
    readonly webhookSecret: string;
    readonly timeoutMs?: number;
}

export class StripeApiAdapter implements StripeAdapter {
    private readonly client: Stripe;
    private readonly webhookSecret: string;

    constructor(config: StripeApiAdapterConfig) {
        this.client = new Stripe(config.secretKey, {
            ...(config.timeoutMs !== undefined ? { timeout: config.timeoutMs } : {}),
        });
        this.webhookSecret = config.webhookSecret;
    }

    async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
        // Usage-based model: the customer attaches a card and the
        // subscription holds a $0 base price. The rollup cron pushes
        // monthly usage as separate invoices (see `pushInvoice`). The
        // recurring price exists only to give Stripe a subscription
        // anchor so the Customer Portal can manage card + cancellation.
        const session = await this.client.checkout.sessions.create({
            mode: "subscription",
            customer_email: input.userEmail,
            line_items: [{ price: input.priceId, quantity: 1 }],
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            client_reference_id: input.workspaceId,
            metadata: { workspaceId: input.workspaceId },
            subscription_data: { metadata: { workspaceId: input.workspaceId } },
        });
        if (session.url === null) {
            throw new Error("stripe checkout session returned no url");
        }
        return { id: session.id, url: session.url };
    }

    async createPortalSession(input: PortalSessionInput): Promise<PortalSessionResult> {
        const session = await this.client.billingPortal.sessions.create({
            customer: input.customerId,
            return_url: input.returnUrl,
        });
        return { url: session.url };
    }

    verifyAndParseEvent(input: VerifyEventInput): StripeWebhookEvent {
        const event = this.client.webhooks.constructEvent(
            input.rawBody,
            input.signatureHeader,
            this.webhookSecret,
        );
        return mapEvent(event);
    }

    async pushInvoice(input: PushInvoiceInput): Promise<PushInvoiceResult> {
        // 1. Create a draft invoice tied to the customer. `pending_invoice_items_behavior: 'exclude'`
        //    keeps Stripe from sweeping any unrelated pending items into this invoice.
        // 2. Attach each line item to the draft via invoiceItems.create with `invoice` set.
        // 3. Finalize. Stripe charges the default payment method according to the customer's
        //    settings; `invoice.paid` / `invoice.payment_failed` webhooks update workspace status.
        const draft = await this.client.invoices.create({
            customer: input.customerId,
            collection_method: "charge_automatically",
            pending_invoice_items_behavior: "exclude",
            metadata: {
                workspaceId: input.workspaceId,
                periodMonth: input.periodMonth,
            },
            description: `Bursora cloud usage — ${input.periodMonth}`,
            auto_advance: false,
        });
        if (!draft.id) {
            throw new Error("stripe.invoices.create returned no id");
        }

        for (const item of input.lineItems) {
            if (item.amountCents <= 0) continue;
            await this.client.invoiceItems.create({
                customer: input.customerId,
                invoice: draft.id,
                amount: item.amountCents,
                currency: "usd",
                description: item.description,
            });
        }

        const finalized = await this.client.invoices.finalizeInvoice(draft.id);
        if (!finalized.id) {
            throw new Error("stripe.invoices.finalizeInvoice returned no id");
        }
        return { invoiceId: finalized.id };
    }

    async refundAllInvoices(input: RefundAllInvoicesInput): Promise<RefundAllInvoicesResult> {
        // Paginate through every paid invoice, locate its underlying
        // PaymentIntent or Charge through the InvoicePayment list, and
        // refund it. Invoices that don't resolve to a chargeable id ($0
        // invoices) and invoices whose payment already has a refund on
        // file are skipped so retries stay idempotent.
        const refundedInvoiceIds: string[] = [];
        let totalCents = 0;
        const reason = (input.reason ??
            "requested_by_customer") as Stripe.RefundCreateParams.Reason;

        for await (const invoice of this.client.invoices.list({
            customer: input.customerId,
            status: "paid",
            limit: 100,
        })) {
            if (!invoice.id) continue;
            const target = await this.resolveRefundTarget(invoice.id);
            if (!target) continue;

            const existing = await this.client.refunds.list({
                ...(target.kind === "payment_intent"
                    ? { payment_intent: target.id }
                    : { charge: target.id }),
                limit: 1,
            });
            if (existing.data.length > 0) continue;

            const refund = await this.client.refunds.create({
                ...(target.kind === "payment_intent"
                    ? { payment_intent: target.id }
                    : { charge: target.id }),
                reason,
                metadata: { invoiceId: invoice.id },
            });
            if (refund.status === "failed" || refund.status === "canceled") continue;
            totalCents += refund.amount;
            refundedInvoiceIds.push(invoice.id);
        }

        return { refundedInvoiceIds, totalCents };
    }

    private async resolveRefundTarget(
        invoiceId: string,
    ): Promise<{ kind: "payment_intent" | "charge"; id: string } | null> {
        for await (const payment of this.client.invoicePayments.list({
            invoice: invoiceId,
            limit: 10,
        })) {
            if (payment.status !== "paid") continue;
            const intent = payment.payment.payment_intent;
            const intentId = typeof intent === "string" ? intent : intent?.id;
            if (intentId) return { kind: "payment_intent", id: intentId };
            const charge = payment.payment.charge;
            const chargeId = typeof charge === "string" ? charge : charge?.id;
            if (chargeId) return { kind: "charge", id: chargeId };
        }
        return null;
    }

    async cancelSubscription(input: { subscriptionId: string }): Promise<void> {
        try {
            await this.client.subscriptions.cancel(input.subscriptionId);
        } catch (err: unknown) {
            // Treat "already canceled" as a no-op so retries stay idempotent.
            if (
                err instanceof Stripe.errors.StripeInvalidRequestError &&
                err.code === "resource_missing"
            ) {
                return;
            }
            throw err;
        }
    }
}

function mapEvent(event: Stripe.Event): StripeWebhookEvent {
    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            return {
                id: event.id,
                type: "checkout.session.completed",
                workspaceId: extractWorkspaceId(session),
                customerId: typeof session.customer === "string" ? session.customer : null,
                subscriptionId:
                    typeof session.subscription === "string" ? session.subscription : null,
            };
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
            const sub = event.data.object as Stripe.Subscription;
            return {
                id: event.id,
                type: event.type,
                workspaceId:
                    sub.metadata !== null && sub.metadata !== undefined
                        ? (sub.metadata.workspaceId ?? null)
                        : null,
                customerId: typeof sub.customer === "string" ? sub.customer : null,
                subscriptionId: sub.id,
                status: sub.status,
            };
        }
        case "invoice.paid":
        case "invoice.payment_failed":
        case "invoice.finalization_failed": {
            const invoice = event.data.object as Stripe.Invoice;
            return {
                id: event.id,
                type: event.type,
                workspaceId: extractInvoiceWorkspaceId(invoice),
                customerId: typeof invoice.customer === "string" ? invoice.customer : null,
                invoiceId: invoice.id ?? null,
                status: invoice.status ?? null,
            };
        }
        case "charge.refunded": {
            const charge = event.data.object as Stripe.Charge;
            return {
                id: event.id,
                type: "charge.refunded",
                customerId: typeof charge.customer === "string" ? charge.customer : null,
            };
        }
        default:
            return { id: event.id, type: "unknown" };
    }
}

function extractInvoiceWorkspaceId(invoice: Stripe.Invoice): string | null {
    if (invoice.metadata !== null && invoice.metadata !== undefined) {
        return invoice.metadata.workspaceId ?? null;
    }
    return null;
}

function extractWorkspaceId(session: Stripe.Checkout.Session): string | null {
    if (typeof session.client_reference_id === "string") {
        return session.client_reference_id;
    }
    if (session.metadata !== null && session.metadata !== undefined) {
        return session.metadata.workspaceId ?? null;
    }
    return null;
}
