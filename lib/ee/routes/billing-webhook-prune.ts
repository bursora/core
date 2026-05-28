/**
 * Daily billing webhook-event prune cron route.
 *
 * `billing_webhook_events` is an append-only idempotency log. Lemon Squeezy
 * stops retrying deliveries within days, so rows past the 90-day retention
 * window are pure forensic weight. This cron deletes them.
 *
 * Callers must present the shared CRON_SECRET via
 * `Authorization: Bearer <secret>`.
 */

import { assertCronAuthorized } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { runBillingWebhookPrune } from "../billing/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
    try {
        assertCronAuthorized(request);
    } catch (res) {
        return res as NextResponse;
    }

    const summary = await runBillingWebhookPrune(new Date());

    console.info("billing.webhook.prune.summary", summary);

    return NextResponse.json(summary);
}
