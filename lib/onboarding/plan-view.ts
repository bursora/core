/**
 * Display data for the onboarding plan card. Reads the single active cloud plan
 * from the plans table (the daily sync's source of truth) and shapes its price,
 * interval, and config-derived features for the client step. Nothing here is
 * hardcoded — price and the included-events feature come straight off the row.
 */

import "server-only";

import { db } from "@/lib/db";
import { drizzlePlanRepository } from "@/lib/plans/drizzle-plan.repository";
import type { PlanConfig } from "@/lib/plans/plan";

export interface OnboardingPlanView {
    readonly name: string;
    readonly price: string;
    readonly interval: string;
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

export async function getOnboardingPlan(): Promise<OnboardingPlanView | null> {
    const plan = await drizzlePlanRepository(db()).findActive();
    if (!plan) return null;
    return {
        name: plan.name,
        price: formatPlanPrice(plan.priceCents, plan.currency),
        interval: plan.interval,
        features: planFeatures(plan.config),
    };
}
