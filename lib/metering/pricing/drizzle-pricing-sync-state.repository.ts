/**
 * Drizzle adapter for the pricing-sync heartbeat. One physical row keyed on
 * `id = 1`. The cron upserts it on every successful run.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { pricingSyncState } from "@/lib/db/schema";

const SINGLETON_ID = 1;

export interface PricingSyncStateRepository {
    recordHeartbeat(now: Date): Promise<void>;
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
});
