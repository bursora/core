/**
 * Display data for the onboarding plan card. Reads the active cloud plan rows
 * from the plans table (the daily sync's source of truth) and shapes a price
 * per billing interval plus config-derived features for the client step. The
 * card offers a monthly/annual toggle, so the view carries both intervals.
 * Nothing here is hardcoded — every price and the included-events feature come
 * straight off a row.
 */

import "server-only";

import { db } from "@/lib/db";
import { drizzlePlanRepository } from "@/lib/plans/drizzle-plan.repository";
import type { BillingInterval, Plan, PlanConfig } from "@/lib/plans/plan";
import { cache } from "react";

export interface OnboardingPlanPrice {
    readonly price: string;
    readonly interval: BillingInterval;
    /** Provider variant id, used to match a subscription back to its plan. */
    readonly variantId: string;
}

export interface OnboardingPlanView {
    readonly name: string;
    readonly monthly: OnboardingPlanPrice | null;
    readonly annual: OnboardingPlanPrice | null;
    readonly features: readonly string[];
}

function formatPlanPrice(priceCents: number, currency: string): string {
    const amount = priceCents / 100;
    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
}

function planFeatures(config: PlanConfig): readonly string[] {
    const bullets: string[] = [];

    const included = config.includedEventsPerMonth;
    if (typeof included === "number" && included > 0) {
        const events = new Intl.NumberFormat(undefined, {
            notation: "compact",
            maximumFractionDigits: 1,
        }).format(included);
        bullets.push(`${events} events / month`);
    }

    const extra = config.features;
    if (Array.isArray(extra)) {
        for (const feature of extra) {
            if (typeof feature === "string" && feature.length > 0) bullets.push(feature);
        }
    }

    return bullets;
}

const priceFor = (
    plans: readonly Plan[],
    interval: BillingInterval,
): OnboardingPlanPrice | null => {
    const plan = plans.find((p) => p.interval === interval);
    return plan
        ? {
              price: formatPlanPrice(plan.priceCents, plan.currency),
              interval,
              variantId: plan.lsVariantId,
          }
        : null;
};

/**
 * Shape the active plan rows into the onboarding card's view model. Returns
 * `null` when no plan is active (self-host / unseeded). Pure — the page reads
 * the rows and passes them in; tests exercise this without a database.
 */
export function toOnboardingPlanView(plans: readonly Plan[]): OnboardingPlanView | null {
    const first = plans[0];
    if (!first) return null;
    return {
        name: first.name,
        monthly: priceFor(plans, "month"),
        annual: priceFor(plans, "year"),
        features: planFeatures(first.config),
    };
}

/**
 * Per-request memoized so multiple server components in one render tree (paywall
 * + billing section) share a single `listActive()` read. Matches the `cache()`
 * pattern on `getUserBillingRecord`.
 */
export const getOnboardingPlan = cache(async (): Promise<OnboardingPlanView | null> => {
    const plans = await drizzlePlanRepository(db()).listActive();
    return toOnboardingPlanView(plans);
});
