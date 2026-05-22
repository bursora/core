/**
 * Monthly billing-rollup cron route.
 *
 * Scheduled for day 1 of every month at 00:00 UTC. Closes the previous
 * month for every active cloud workspace: computes the bill, pushes a
 * Stripe invoice, and persists `last_invoice_id` / `last_billed_month`.
 *
 * Callers must present the shared CRON_SECRET via
 * `Authorization: Bearer <secret>`.
 */

import { assertCronAuthorized } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { runBillingRollup } from "../billing/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
    try {
        assertCronAuthorized(request);
    } catch (res) {
        return res as NextResponse;
    }

    const summary = await runBillingRollup(new Date());

    console.info("billing.rollup.summary", summary);

    return NextResponse.json(summary);
}
