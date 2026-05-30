/**
 * Bootstrap global pricing rows by running the litellm sync once.
 *
 * The daily cron at `app/api/cron/pricing-sync/route.ts` populates the
 * `pricing` table in production. Local dev needs the same rates before the
 * scheduler ever fires — running the same sync use case from a Bun script
 * gets there without duplicating the rate table.
 *
 * Repo methods are inlined here so this script doesn't pull `server-only`-
 * tagged files into a non-Next runtime.
 *
 * Run: `bun drizzle/seed.ts`
 */

import { litellmPricingSource } from "@/lib/metering/pricing/litellm-pricing-source.adapter";
import type { NewPricingRow } from "@/lib/metering/pricing/pricing-row";
import {
    PricingSyncPartialFailure,
    syncPricing,
    type SyncPricingRepo,
} from "@/lib/metering/pricing/sync-pricing.usecase";
import type { PlanSyncRepository, PlanUpsert } from "@/lib/plans/plan";
import { TRACKED_PLANS } from "@/lib/plans/plan-config";
import { shouldSyncPlans, syncPlans } from "@/lib/plans/sync-plans.usecase";
import { and, desc, sql as dsql, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { plans, pricing } from "../lib/db/schema";
import { lemonSqueezyPlanSource } from "./plan-sync/lemonsqueezy-plan-source";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const sql = postgres(url);
const db = drizzle(sql);

const asGlobalRow = (row: NewPricingRow) => ({ ...row, workspaceId: null, effectiveTo: null });

const repo: SyncPricingRepo = {
    findLatestGlobal: async (provider, model, region) => {
        const [row] = await db
            .select()
            .from(pricing)
            .where(
                and(
                    eq(pricing.provider, provider),
                    eq(pricing.model, model),
                    eq(pricing.region, region),
                    isNull(pricing.workspaceId),
                    isNull(pricing.effectiveTo),
                ),
            )
            .orderBy(desc(pricing.effectiveFrom))
            .limit(1);
        return row ?? null;
    },
    closeAndInsert: (toCloseId, effectiveTo, toInsert) =>
        db.transaction(async (tx) => {
            await tx
                .update(pricing)
                .set({ effectiveTo })
                .where(and(eq(pricing.id, toCloseId), isNull(pricing.workspaceId)));
            await tx.insert(pricing).values(asGlobalRow(toInsert));
        }),
    insert: async (row) => {
        await db.insert(pricing).values(asGlobalRow(row));
    },
};

// Backdate effective_from so dev/playground events with backdated ts (e.g.
// the anomaly baseline) still find a pricing row. Production cron uses now().
try {
    const { inserted, unchanged } = await syncPricing(
        [litellmPricingSource],
        repo,
        new Date("2000-01-01T00:00:00Z"),
    );
    console.log(`Pricing sync: ${inserted} inserted, ${unchanged} unchanged`);
} catch (error: unknown) {
    if (error instanceof PricingSyncPartialFailure) {
        console.log(`Pricing sync failed for providers: ${error.failedProviders.join(", ")}`);
    } else {
        throw error;
    }
}

// --- plan sync ---------------------------------------------------------------
// Cloud installs with LS configured pull the Bursora Cloud plan into `plans`.
// Self-host (or missing keys) skips cleanly — the dashboard reads plans only
// for cloud-only checkout, so an empty table is fine off cloud.
const isCloud = ["true", "1", "yes"].includes((process.env.IS_CLOUD ?? "").trim().toLowerCase());
const lsApiKey = process.env.LEMONSQUEEZY_API_KEY ?? "";
const lsStoreId = process.env.LEMONSQUEEZY_STORE_ID ?? "";

if (shouldSyncPlans({ isCloud, apiKey: lsApiKey, storeId: lsStoreId })) {
    const planRepo: PlanSyncRepository = {
        upsertByVariant: async (plan: PlanUpsert) => {
            await db
                .insert(plans)
                .values({
                    lsProductId: plan.lsProductId,
                    lsVariantId: plan.lsVariantId,
                    name: plan.name,
                    description: plan.description,
                    priceCents: plan.priceCents,
                    currency: plan.currency,
                    interval: plan.interval,
                    intervalCount: plan.intervalCount,
                    config: plan.config,
                    syncedAt: plan.syncedAt,
                })
                .onConflictDoUpdate({
                    target: plans.lsVariantId,
                    set: {
                        lsProductId: plan.lsProductId,
                        name: plan.name,
                        description: plan.description,
                        priceCents: plan.priceCents,
                        currency: plan.currency,
                        interval: plan.interval,
                        intervalCount: plan.intervalCount,
                        config: plan.config,
                        syncedAt: plan.syncedAt,
                        updatedAt: dsql`now()`,
                    },
                });
        },
    };

    const planSource = lemonSqueezyPlanSource({
        apiKey: lsApiKey,
        storeId: lsStoreId,
        trackedProductIds: TRACKED_PLANS.map((p) => p.lsProductId),
    });

    const { upserted, skipped } = await syncPlans(planSource, planRepo, TRACKED_PLANS, new Date());
    console.log(`Plan sync: ${upserted} upserted, ${skipped} skipped`);
    if (upserted < TRACKED_PLANS.length) {
        console.warn(
            `Plan sync: only ${upserted}/${TRACKED_PLANS.length} tracked plans synced — check TRACKED_PLANS product ids against Lemon Squeezy`,
        );
    }
} else {
    console.log("Plan sync: skipped (not cloud or LEMONSQUEEZY_API_KEY/STORE_ID absent)");
}

await sql.end();
