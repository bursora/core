/**
 * Anomaly detection cron route.
 *
 * Triggered every 5 minutes by an external scheduler. The caller MUST
 * present the shared CRON_SECRET via the `Authorization: Bearer <secret>`
 * header. Any other request is rejected with 401.
 *
 * Returns the run summary as JSON so scheduler logs see what happened.
 *
 * Layer rule: this route imports from application/ only — concrete
 * adapters are wired inside `runAnomalyCron`.
 */

import { assertCronAuthorized } from "@/lib/cron-auth";
import { runAnomalyCron } from "@/lib/detection";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
    try {
        assertCronAuthorized(request);
    } catch (res) {
        return res as NextResponse;
    }

    const summary = await runAnomalyCron(new Date());

    console.info("anomaly.summary", summary);

    return NextResponse.json(summary);
}
