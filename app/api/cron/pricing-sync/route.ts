/**
 * Daily pricing sync cron route.
 *
 * Triggered by an external scheduler (Hetzner cron / Vercel Cron / GitHub
 * Actions). The caller MUST present the shared CRON_SECRET via the
 * `Authorization: Bearer <secret>` header. Any other request is rejected.
 *
 * Returns the run summary as JSON on success so scheduler logs see what
 * happened. On partial failure (one or more pricing sources errored), the
 * use case throws `PricingSyncPartialFailure`; the route surfaces it as a
 * 500 carrying `{ error, failedProviders }` so the scheduler can retry /
 * page. Without this, a flaky provider could leave Bursora billing against
 * stale rates for days, undetected.
 *
 * Layer rule: this route imports from application/ only — concrete adapters
 * are wired inside `runPricingSync`.
 */

import { assertCronAuthorized } from "@/lib/cron-auth";
import { runPricingSync } from "@/lib/metering/pricing/run-pricing-sync.usecase";
import { PricingSyncPartialFailure } from "@/lib/metering/pricing/sync-pricing.usecase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
    try {
        assertCronAuthorized(request);
    } catch (res) {
        return res as NextResponse;
    }

    try {
        const summary = await runPricingSync(new Date());
        console.info("pricing-sync.summary", summary);
        return NextResponse.json(summary);
    } catch (error: unknown) {
        if (error instanceof PricingSyncPartialFailure) {
            console.error("pricing-sync.partial_failure", {
                failedProviders: error.failedProviders,
            });
            return NextResponse.json(
                {
                    error: "pricing_sync_partial_failure",
                    failedProviders: error.failedProviders,
                },
                { status: 500 },
            );
        }
        throw error;
    }
}
