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
import { syncPricing, type SyncPricingRepo } from "@/lib/metering/pricing/sync-pricing.usecase";
import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { pricing } from "../lib/db/schema";

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
const { inserted, unchanged, failedProviders } = await syncPricing(
    [litellmPricingSource],
    repo,
    new Date("2000-01-01T00:00:00Z"),
);

const failed = failedProviders.length > 0 ? `, failed: ${failedProviders.join(", ")}` : "";
console.log(`Pricing sync: ${inserted} inserted, ${unchanged} unchanged${failed}`);

await sql.end();
