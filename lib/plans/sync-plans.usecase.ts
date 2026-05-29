/**
 * Plan sync use case.
 *
 * Fetch the provider-owned facts for every tracked plan, merge the Bursora-side
 * `config` (matched by `lsProductId`), and upsert one row per plan keyed on
 * `lsVariantId`. Idempotent: a second run updates the same rows in place.
 *
 * Pure and I/O-free — the LS-calling fetcher and the drizzle repo are injected,
 * mirroring `sync-pricing.usecase.ts`. This keeps the use case testable with a
 * fake source and keeps LS-calling code out of any bundled module.
 *
 * A fetched plan whose `lsProductId` is not in `trackedPlans` is skipped: we
 * have no Bursora-side defaults for it, so persisting it would store an
 * untracked tier with an empty config.
 */

import type { PlanSyncRepository, PlanUpsert } from "./plan";
import type { TrackedPlan } from "./plan-config";
import type { FetchedPlan, PlanSource } from "./plan-source";

export interface PlanSyncSummary {
    upserted: number;
    skipped: number;
}

export async function syncPlans(
    source: PlanSource,
    repo: PlanSyncRepository,
    trackedPlans: readonly TrackedPlan[],
    now: Date,
): Promise<PlanSyncSummary> {
    const configByProduct = new Map(trackedPlans.map((p) => [p.lsProductId, p.config]));
    const summary: PlanSyncSummary = { upserted: 0, skipped: 0 };

    for (const fetched of await source.fetchPlans()) {
        const config = configByProduct.get(fetched.lsProductId);
        if (config === undefined) {
            summary.skipped += 1;
            continue;
        }
        await repo.upsertByVariant(toUpsert(fetched, config, now));
        summary.upserted += 1;
    }

    return summary;
}

const toUpsert = (
    fetched: FetchedPlan,
    config: TrackedPlan["config"],
    syncedAt: Date,
): PlanUpsert => ({
    lsProductId: fetched.lsProductId,
    lsVariantId: fetched.lsVariantId,
    name: fetched.name,
    description: fetched.description,
    priceCents: fetched.priceCents,
    currency: fetched.currency,
    interval: fetched.interval,
    intervalCount: fetched.intervalCount,
    config,
    syncedAt,
});

/**
 * Whether the DB seeder should run a plan sync. Cloud installs with the LS API
 * key and store id configured sync; everything else (self-host, missing keys)
 * no-ops cleanly. Kept here so the seeder and the sync share one predicate.
 */
export function shouldSyncPlans(env: {
    readonly isCloud: boolean;
    readonly apiKey: string;
    readonly storeId: string;
}): boolean {
    return env.isCloud && env.apiKey.length > 0 && env.storeId.length > 0;
}
