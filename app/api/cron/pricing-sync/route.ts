/**
 * Daily pricing sync cron route.
 *
 * Triggered by an external scheduler (Hetzner cron / Vercel Cron / GitHub
 * Actions). The caller MUST present the shared CRON_SECRET via the
 * `Authorization: Bearer <secret>` header. Any other request is rejected.
 *
 * Returns the run summary as JSON so the scheduler logs see what happened.
 *
 * Layer rule: this route imports from application/ only — concrete adapters
 * are wired inside `runPricingSync`.
 */

import { assertCronAuthorized } from "@/lib/cron-auth";
import { runPricingSync } from "@/lib/metering/pricing/run-pricing-sync.usecase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
    try {
        assertCronAuthorized(request);
    } catch (res) {
        return res as NextResponse;
    }

    const summary = await runPricingSync(new Date());

    console.info("pricing-sync.summary", summary);

    return NextResponse.json(summary);
}
