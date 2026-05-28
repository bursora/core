/**
 * Monthly billing-rollup cron route.
 *
 * Scheduled for day 1 of every month at 00:00 UTC. Closes the previous
 * month for every active cloud workspace: computes the bill, posts a
 * Lemon Squeezy usage record against the workspace's subscription, and
 * persists `last_invoice_ref` (LS usage-record id) / `last_billed_month`.
 *
 * Callers must present the shared CRON_SECRET via
 * `Authorization: Bearer <secret>`.
 */

import { assertCronAuthorized } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { checkBillingCredentials, runBillingRollup } from "../billing/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
    try {
        assertCronAuthorized(request);
    } catch (res) {
        return res as NextResponse;
    }

    // Boot-time (memoized) probe: confirm the LS key still authenticates
    // before spending it on usage records. A rotated key throws here and
    // fails the cron loud instead of silently dropping the month's invoice.
    await checkBillingCredentials();

    const summary = await runBillingRollup(new Date());

    console.info("billing.rollup.summary", summary);

    return NextResponse.json(summary);
}
