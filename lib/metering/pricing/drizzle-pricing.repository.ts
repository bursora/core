/**
 * Drizzle implementation of the pricing repository.
 *
 * Reads/writes scoped to GLOBAL pricing rows (workspaceId IS NULL). Workspace
 * overrides are owned by a separate write path in settings and must remain
 * untouched by the cron — every query here filters explicitly.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { requireInsertedRow } from "@/lib/db";
import { pricing } from "@/lib/db/schema";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { NewPricingRow, PricingRepository, PricingRow } from "./pricing-row";

const toInsertValues = (row: NewPricingRow) => ({
    workspaceId: null,
    provider: row.provider,
    model: row.model,
    region: row.region,
    inputPer1mUsd: row.inputPer1mUsd,
    outputPer1mUsd: row.outputPer1mUsd,
    cachePer1mUsd: row.cachePer1mUsd,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: null,
});

export const drizzlePricingRepository = (db: Db): PricingRepository => ({
    findLatestGlobal: async (provider, model, region) => {
        const rows = await db
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

        const row = rows[0];
        if (!row) return null;
        return mapRow(row);
    },

    closeAndInsert: async (toCloseId, effectiveTo, toInsert) => {
        await db.transaction(async (tx) => {
            await tx
                .update(pricing)
                .set({ effectiveTo })
                .where(and(eq(pricing.id, toCloseId), isNull(pricing.workspaceId)));

            await tx.insert(pricing).values(toInsertValues(toInsert));
        });
    },

    insert: async (toInsert) => {
        await db.insert(pricing).values(toInsertValues(toInsert));
    },

    findCandidatesForLookup: async ({ provider, model, region, workspaceId }) => {
        const rows = await db
            .select()
            .from(pricing)
            .where(
                and(
                    eq(pricing.provider, provider),
                    eq(pricing.model, model),
                    eq(pricing.region, region),
                    or(isNull(pricing.workspaceId), eq(pricing.workspaceId, workspaceId)),
                ),
            );
        return rows.map(mapRow);
    },

    findAllCandidatesForWorkspace: async (workspaceId) => {
        const rows = await db
            .select()
            .from(pricing)
            .where(or(isNull(pricing.workspaceId), eq(pricing.workspaceId, workspaceId)));
        return rows.map(mapRow);
    },

    insertOverride: async ({ workspaceId, row, effectiveTo }) => {
        const [inserted] = await db
            .insert(pricing)
            .values({
                workspaceId,
                provider: row.provider,
                model: row.model,
                region: row.region,
                inputPer1mUsd: row.inputPer1mUsd,
                outputPer1mUsd: row.outputPer1mUsd,
                cachePer1mUsd: row.cachePer1mUsd,
                effectiveFrom: row.effectiveFrom,
                effectiveTo,
            })
            .returning();
        return mapRow(requireInsertedRow(inserted, "pricing override"));
    },

    listOverridesByWorkspace: async (workspaceId) => {
        const rows = await db
            .select()
            .from(pricing)
            .where(eq(pricing.workspaceId, workspaceId))
            .orderBy(desc(pricing.effectiveFrom));
        return rows.map(mapRow);
    },

    deleteOverride: async ({ id, workspaceId }) => {
        const deleted = await db
            .delete(pricing)
            .where(and(eq(pricing.id, id), eq(pricing.workspaceId, workspaceId)))
            .returning({ id: pricing.id });
        return deleted.length > 0;
    },

    updateOverride: async ({ id, workspaceId, row, effectiveTo }) => {
        const [updated] = await db
            .update(pricing)
            .set({
                provider: row.provider,
                model: row.model,
                region: row.region,
                inputPer1mUsd: row.inputPer1mUsd,
                outputPer1mUsd: row.outputPer1mUsd,
                cachePer1mUsd: row.cachePer1mUsd,
                effectiveFrom: row.effectiveFrom,
                effectiveTo,
            })
            .where(and(eq(pricing.id, id), eq(pricing.workspaceId, workspaceId)))
            .returning();
        if (!updated) return null;
        return mapRow(updated);
    },
});

const mapRow = (row: typeof pricing.$inferSelect): PricingRow => ({
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    model: row.model,
    region: row.region,
    inputPer1mUsd: row.inputPer1mUsd,
    outputPer1mUsd: row.outputPer1mUsd,
    cachePer1mUsd: row.cachePer1mUsd,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
});
