/**
 * Composition entry point for the daily pricing sync cron.
 *
 * The cron route handler in `app/api/cron/pricing-sync/route.ts` only sees
 * use cases per the ESLint boundary rules — it is forbidden from reaching
 * into infrastructure directly. This file wires concrete adapters (drizzle
 * repo + provider sources + heartbeat state) and exposes a single async
 * entry point that returns the run summary.
 *
 * Network failure on any provider aborts the run with
 * `PricingSyncPartialFailure`; the route surfaces that as 500 so the
 * scheduler retries / pages. On a fully successful run, the heartbeat row
 * (`pricing_sync_state`) is updated so any future freshness check / dashboard
 * tile can read the last-good timestamp.
 */

import "server-only";

import { db } from "@/lib/db";
import { drizzlePricingSyncStateRepository } from "./drizzle-pricing-sync-state.repository";
import { drizzlePricingRepository } from "./drizzle-pricing.repository";
import { litellmPricingSource } from "./litellm-pricing-source.adapter";
import { syncPricing, type SyncSummary } from "./sync-pricing.usecase";

export async function runPricingSync(now: Date = new Date()): Promise<SyncSummary> {
    const conn = db();
    const repo = drizzlePricingRepository(conn);
    const state = drizzlePricingSyncStateRepository(conn);
    return syncPricing([litellmPricingSource], repo, now, {
        recordHeartbeat: state.recordHeartbeat,
    });
}
