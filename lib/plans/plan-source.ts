/**
 * Port for a plan source.
 *
 * A `PlanSource` fetches the provider-owned facts for one tracked plan: the
 * product/variant ids, display name, description, price, interval, and store
 * currency. The concrete Lemon Squeezy implementation lives seed-side so the
 * OSS bundle never statically imports LS-calling code. The sync use case
 * depends only on this port, so tests pass a fake.
 */

export interface FetchedPlan {
    lsProductId: string;
    lsVariantId: string;
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    interval: string;
    intervalCount: number;
}

export interface PlanSource {
    /** Provider-owned facts for every tracked plan. */
    fetchPlans(): Promise<readonly FetchedPlan[]>;
}
