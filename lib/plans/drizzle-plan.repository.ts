/**
 * Drizzle implementation of the plan repositories.
 *
 * One concrete object satisfies both the read API (`listActive`, `findActive`)
 * and the seed-side write (`upsertByVariant`). The read half carries no EE
 * imports, so a future public pricing route or checkout page can call it
 * without pulling `@/lib/ee/*`.
 *
 * `upsertByVariant` relies on the unique constraint on `ls_variant_id`: insert,
 * or on conflict update every provider-owned column plus `config` and
 * `synced_at`. `is_active` and `created_at` are left untouched on update.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import type { Plan, PlanReadRepository, PlanSyncRepository, PlanUpsert } from "./plan";

type PlanRow = typeof plans.$inferSelect;

/** Defensive ceiling on the public, unauthenticated active-plans read. */
const ACTIVE_PLANS_LIMIT = 50;

const mapRow = (row: PlanRow): Plan => ({
    id: row.id,
    lsProductId: row.lsProductId,
    lsVariantId: row.lsVariantId,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    currency: row.currency,
    interval: row.interval,
    intervalCount: row.intervalCount,
    config: row.config as Plan["config"],
    isActive: row.isActive,
    syncedAt: row.syncedAt,
});

export const drizzlePlanRepository = (db: Db): PlanReadRepository & PlanSyncRepository => ({
    listActive: async () => {
        const rows = await db
            .select()
            .from(plans)
            .where(eq(plans.isActive, true))
            .orderBy(asc(plans.priceCents))
            .limit(ACTIVE_PLANS_LIMIT);
        return rows.map(mapRow);
    },

    findActive: async () => {
        const rows = await db
            .select()
            .from(plans)
            .where(eq(plans.isActive, true))
            .orderBy(asc(plans.priceCents))
            .limit(1);
        const row = rows[0];
        return row ? mapRow(row) : null;
    },

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
                    updatedAt: sql`now()`,
                },
            });
    },
});
