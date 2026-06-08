/**
 * GET /api/internal/subscription-status — session-authenticated "does this user
 * have Bursora Cloud access yet?" signal. The onboarding plan step polls this
 * after returning from Lemon Squeezy checkout so the page advances the moment
 * the activation webhook lands — whether that arrives before or after the
 * checkout redirect.
 *
 * `active` means the user clears the pay-step: an active subscription, or an
 * admin/beta comp account. Off cloud / OSS builds it is always false (the plan
 * step never renders there).
 */

import { getRequestSession } from "@/lib/auth";
import { userHasCloudAccess } from "@/lib/onboarding/plan-entry";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
    const session = await getRequestSession();
    if (!session) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const active = await userHasCloudAccess(session.user.id);
    return NextResponse.json({ active }, { status: 200 });
}
