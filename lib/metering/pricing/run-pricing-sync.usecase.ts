/**
 * Composition entry point for the daily pricing sync cron.
 *
 * The in-process scheduler (`lib/cron/scheduler.ts`) calls this on its daily
 * tick. This file wires concrete adapters (drizzle repo + provider sources +
 * heartbeat state) and exposes a single async entry point that returns the
 * run summary.
 *
 * Network failure on any provider aborts the run with
 * `PricingSyncPartialFailure`; the scheduler logs it to Sentry and the next
 * scheduled tick retries. On a fully successful run, the heartbeat row
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
