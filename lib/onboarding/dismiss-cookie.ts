/**
 * Per-workspace cookie that records the user dismissed the onboarding widget.
 * Follows the issued-key flash-cookie pattern: the reader works in a Server
 * Component, the setter must run inside a Server Action (Next.js forbids
 * `cookies().set` elsewhere). The widget's `[×]` calls the setter; the
 * resolver reads it to hide an already-dismissed widget.
 */

import { cookies } from "next/headers";

const DISMISS_COOKIE_PREFIX = "onboarding_dismissed_";
const DISMISS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function onboardingDismissedCookie(workspaceId: string): string {
    return `${DISMISS_COOKIE_PREFIX}${workspaceId}`;
}

export async function isOnboardingDismissed(workspaceId: string): Promise<boolean> {
    const jar = await cookies();
    return jar.get(onboardingDismissedCookie(workspaceId))?.value === "1";
}

export async function setOnboardingDismissed(workspaceId: string): Promise<void> {
    const jar = await cookies();
    jar.set(onboardingDismissedCookie(workspaceId), "1", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: DISMISS_COOKIE_MAX_AGE,
        path: "/",
    });
}
