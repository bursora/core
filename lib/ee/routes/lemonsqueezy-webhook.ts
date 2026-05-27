/**
 * POST /api/webhooks/lemonsqueezy — Lemon Squeezy webhook ingress.
 *
 * LS signs every webhook delivery with `X-Signature` (HMAC SHA-256 of the
 * raw body under the configured webhook secret). Verification must see the
 * exact bytes LS sent, so we read `request.text()` before any JSON parsing.
 * A missing or failing signature returns 400 — LS retries on non-2xx, so
 * legitimate transient failures get re-delivered while forged or replayed
 * deliveries continue to be rejected.
 *
 * The use case deduplicates by event id, so a 200 on a replay is still a
 * 200 to the caller; LS treats both as accepted and stops retrying.
 */

import { NextResponse } from "next/server";
import { handleWebhook } from "../billing/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
    const signatureHeader = request.headers.get("x-signature");
    if (!signatureHeader) {
        return NextResponse.json({ error: "missing_signature" }, { status: 400 });
    }

    const rawBody = await request.text();

    try {
        const result = await handleWebhook({
            rawBody,
            signatureHeader,
        });
        if (!result.verified) {
            return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
        }
        return NextResponse.json({ received: true, deduped: result.deduped ?? false });
    } catch (err) {
        console.error("lemonsqueezy.webhook.error", err);
        return NextResponse.json({ error: "webhook_failed" }, { status: 500 });
    }
}
