/**
 * Browser cookie, namespaced by user id, that records the user skipped the
 * optional plan step ⓪. Follows the dismiss-cookie pattern: the reader works
 * in a Server Component, the setter must run inside a Server Action. Once set,
 * the `/workspace` entry redirect stops routing that unsubscribed user back
 * into the plan step. Namespacing by user id keeps one user's skip from
 * suppressing the plan step for another user signing in on a shared browser.
 */

import { cookies } from "next/headers";

const PLAN_SKIPPED_COOKIE_PREFIX = "onboarding_plan_skipped_";
const PLAN_SKIPPED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function planStepSkippedCookie(userId: string): string {
    return `${PLAN_SKIPPED_COOKIE_PREFIX}${userId}`;
}

export async function isPlanStepSkipped(userId: string): Promise<boolean> {
    const jar = await cookies();
    return jar.get(planStepSkippedCookie(userId))?.value === "1";
}

export async function setPlanStepSkipped(userId: string): Promise<void> {
    const jar = await cookies();
    jar.set(planStepSkippedCookie(userId), "1", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: PLAN_SKIPPED_COOKIE_MAX_AGE,
        path: "/",
    });
}
