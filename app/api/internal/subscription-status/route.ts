/**
 * GET /api/internal/subscription-status — session-authenticated "is this user
 * subscribed to Bursora Cloud yet?" signal. The onboarding plan step polls this
 * after returning from Lemon Squeezy checkout so the page reflects the
 * subscription the moment the activation webhook lands — whether that arrives
 * before or after the checkout redirect.
 *
 * Returns `{ active: boolean }` for the signed-in user. Off cloud / OSS builds
 * it is always false (the plan step never renders there).
 */

import { getRequestSession } from "@/lib/auth";
import { isUserSubscribed } from "@/lib/onboarding/plan-entry";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
    const session = await getRequestSession();
    if (!session) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const active = await isUserSubscribed(session.user.id);
    return NextResponse.json({ active }, { status: 200 });
}
