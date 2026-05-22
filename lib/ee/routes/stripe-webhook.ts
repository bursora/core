/**
 * POST /api/webhooks/stripe — Stripe webhook ingress.
 *
 * Stripe signs every webhook with `Stripe-Signature`. The verification step
 * uses the raw bytes of the request body, so this route reads `request.text()`
 * before any JSON parsing. A failed signature returns 400 — Stripe interprets
 * that as a delivery failure and retries, which is exactly what we want for
 * forged or replayed requests.
 */

import { handleStripeWebhook } from "../billing/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
    const signatureHeader = request.headers.get("stripe-signature");
    if (!signatureHeader) {
        return NextResponse.json({ error: "missing_signature" }, { status: 400 });
    }

    const rawBody = await request.text();

    try {
        const result = await handleStripeWebhook({
            rawBody,
            signatureHeader,
        });
        if (!result.verified) {
            return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
        }
        return NextResponse.json({ received: true });
    } catch (err) {
        console.error("stripe.webhook.error", err);
        return NextResponse.json({ error: "webhook_failed" }, { status: 500 });
    }
}
