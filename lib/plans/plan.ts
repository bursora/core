/**
 * Plan entity + repository interfaces.
 *
 * A plan is a cloud pricing tier. Name, description, price, interval, and
 * currency mirror Lemon Squeezy; `config` carries Bursora-side defaults that LS
 * never overrides. Plans are upserted by `lsVariantId` so a re-sync updates the
 * same row in place.
 *
 * `PlanReadRepository` lives here (non-EE) so a future public route or checkout
 * page can read plans WITHOUT pulling `@/lib/ee/*`. The write half
 * (`PlanSyncRepository`) is split out so the seed-only sync path depends on the
 * narrow upsert surface, not the full read API.
 */

export interface PlanConfig {
    readonly [key: string]: unknown;
}

/**
 * The two billing intervals a cloud plan can be sold on, matching Lemon
 * Squeezy's variant `interval` values. Annual is monthly priced for ten months
 * (two months free). Used to validate the interval a checkout asks for and to
 * select the matching plan row.
 */
export type BillingInterval = "month" | "year";

/** Narrow an untrusted string to a `BillingInterval`, or `null` if neither. */
export function parseBillingInterval(value: unknown): BillingInterval | null {
    return value === "month" || value === "year" ? value : null;
}

export interface Plan {
    id: string;
    lsProductId: string;
    lsVariantId: string;
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    interval: string;
    intervalCount: number;
    config: PlanConfig;
    isActive: boolean;
    syncedAt: Date;
}

/**
 * Shape the sync use case writes. `id`, `createdAt`, and `updatedAt` are owned
 * by the repo. `isActive` defaults true on insert and is not toggled by sync.
 */
export interface PlanUpsert {
    lsProductId: string;
    lsVariantId: string;
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    interval: string;
    intervalCount: number;
    config: PlanConfig;
    syncedAt: Date;
}

export interface PlanReadRepository {
    /**
     * Every active plan, ordered by `priceCents` ascending so the cheapest tier
     * reads first. Inactive plans are excluded.
     */
    listActive(): Promise<readonly Plan[]>;
}

/**
 * Narrow write surface the sync use case depends on. Upsert is keyed on
 * `lsVariantId` (unique): insert when absent, update in place when present.
 */
export interface PlanSyncRepository {
    upsertByVariant(plan: PlanUpsert): Promise<void>;
}
