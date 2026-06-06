/**
 * In-memory `PlanReadRepository` for billing/checkout tests.
 *
 * `listActive` returns the seeded plans in insertion order. Mirrors the
 * production Drizzle repo's contract (active-only, cheapest-first) closely
 * enough for unit tests that never touch a database.
 */

import type { Plan, PlanReadRepository } from "@/lib/plans/plan";

const BASE_PLAN: Plan = {
    id: "plan_1",
    lsProductId: "prod_1",
    lsVariantId: "variant_seeded",
    name: "Cloud",
    description: "Bursora Cloud",
    priceCents: 2900,
    currency: "USD",
    interval: "month",
    intervalCount: 1,
    config: {},
    isActive: true,
    syncedAt: new Date("2026-01-01T00:00:00.000Z"),
};

export class InMemoryPlanRepository implements PlanReadRepository {
    private readonly active: Plan[] = [];

    seed(overrides: Partial<Plan> = {}): Plan {
        const plan: Plan = { ...BASE_PLAN, ...overrides };
        this.active.push(plan);
        return plan;
    }

    async listActive(): Promise<readonly Plan[]> {
        return [...this.active];
    }
}
