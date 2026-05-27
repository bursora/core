/**
 * Drizzle adapter for the pricing-sync heartbeat. One physical row keyed on
 * `id = 1`. The cron writes (upsert) on every successful run; freshness checks
 * read the column directly.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { pricingSyncState } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SINGLETON_ID = 1;

export interface PricingSyncStateRepository {
    recordHeartbeat(now: Date): Promise<void>;
    readLastSyncedAt(): Promise<Date | null>;
}

export const drizzlePricingSyncStateRepository = (db: Db): PricingSyncStateRepository => ({
    recordHeartbeat: async (now) => {
        await db
            .insert(pricingSyncState)
            .values({ id: SINGLETON_ID, lastSyncedAt: now })
            .onConflictDoUpdate({
                target: pricingSyncState.id,
                set: { lastSyncedAt: now },
            });
    },
    readLastSyncedAt: async () => {
        const [row] = await db
            .select({ lastSyncedAt: pricingSyncState.lastSyncedAt })
            .from(pricingSyncState)
            .where(eq(pricingSyncState.id, SINGLETON_ID))
            .limit(1);
        return row?.lastSyncedAt ?? null;
    },
});
