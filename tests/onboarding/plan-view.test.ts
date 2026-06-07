/**
 * `toOnboardingPlanView` shapes the active plan rows into the onboarding card's
 * view model. The card offers a monthly/annual toggle, so the view carries a
 * formatted price for each interval the plans table holds. Features are
 * config-derived and shared across intervals. Nothing is hardcoded — every
 * figure comes off a row.
 */

import { toOnboardingPlanView } from "@/lib/onboarding/plan-view";
import type { Plan } from "@/lib/plans/plan";
import { describe, expect, test } from "bun:test";

const plan = (overrides: Partial<Plan>): Plan => ({
    id: "plan_1",
    lsProductId: "prod_1",
    lsVariantId: "variant_1",
    name: "Bursora Cloud",
    description: null,
    priceCents: 2900,
    currency: "USD",
    interval: "month",
    intervalCount: 1,
    config: { includedEventsPerMonth: 5_000_000, features: ["Spike alerts"] },
    isActive: true,
    syncedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
});

describe("toOnboardingPlanView", () => {
    test("carries both monthly and annual prices off the rows", () => {
        const view = toOnboardingPlanView([
            plan({ interval: "month", priceCents: 2900 }),
            plan({ interval: "year", priceCents: 29000, lsVariantId: "variant_2" }),
        ]);

        expect(view?.name).toBe("Bursora Cloud");
        expect(view?.monthly).toEqual({ price: "$29", interval: "month", variantId: "variant_1" });
        expect(view?.annual).toEqual({ price: "$290", interval: "year", variantId: "variant_2" });
        expect(view?.features).toContain("5M events / month");
        expect(view?.features).toContain("Spike alerts");
    });

    test("monthly-only plans expose a null annual", () => {
        const view = toOnboardingPlanView([plan({ interval: "month", priceCents: 2900 })]);

        expect(view?.monthly).toEqual({ price: "$29", interval: "month", variantId: "variant_1" });
        expect(view?.annual).toBeNull();
    });

    test("returns null when no plans are active", () => {
        expect(toOnboardingPlanView([])).toBeNull();
    });
});
