/**
 * GET /api/public/plans — public, unauthenticated pricing feed.
 *
 * The marketing site reads this to render its pricing section and start the
 * cloud checkout. It is read-only and requires no session: the root
 * middleware sets security headers on `/api/*` but gates no auth, and this
 * route calls no auth helper, so it stays open by construction.
 *
 * Only customer-facing fields are exposed. Internal ids (`id`, `lsProductId`),
 * the Bursora-side `config`, and `isActive`/`syncedAt` never leave the server.
 * `lsVariantId` is included because the site needs it to open checkout.
 *
 * Self-host installs seed no plans, so the feed is `[]` there. The response
 * carries a short public edge cache: plans only change on the daily sync, so
 * stale-by-minutes is fine and keeps the marketing page off the database.
 *
 * Uses ONLY the non-EE `lib/plans` read repo so the route stays out of the EE
 * boundary and the OSS bundle.
 */

import { db } from "@/lib/db";
import { drizzlePlanRepository } from "@/lib/plans/drizzle-plan.repository";
import type { Plan, PlanReadRepository } from "@/lib/plans/plan";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Edge cache window in seconds. */
const CACHE_MAX_AGE_SECONDS = 300;

export interface PublicPlan {
    readonly name: string;
    readonly description: string | null;
    readonly priceCents: number;
    readonly currency: string;
    readonly interval: string;
    readonly intervalCount: number;
    readonly lsVariantId: string;
}

const toPublicPlan = (plan: Plan): PublicPlan => ({
    name: plan.name,
    description: plan.description,
    priceCents: plan.priceCents,
    currency: plan.currency,
    interval: plan.interval,
    intervalCount: plan.intervalCount,
    lsVariantId: plan.lsVariantId,
});

let testOverride: PlanReadRepository | null = null;

/**
 * Inject a test-only plan repo. Pass `null` to clear. Throws outside the test
 * environment so production never reads an injected override.
 */
export function setPlansRepoForTesting(repo: PlanReadRepository | null): void {
    if (process.env.NODE_ENV !== "test") {
        throw new Error("setPlansRepoForTesting only available in test");
    }
    testOverride = repo;
}

const plansRepo = (): PlanReadRepository => testOverride ?? drizzlePlanRepository(db());

export async function GET(_request: Request): Promise<NextResponse> {
    const plans = await plansRepo().listActive();
    return NextResponse.json(plans.map(toPublicPlan), {
        headers: {
            "Cache-Control": `public, s-maxage=${CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${CACHE_MAX_AGE_SECONDS}`,
        },
    });
}
