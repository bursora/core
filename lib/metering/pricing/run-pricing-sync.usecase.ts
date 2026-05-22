/**
 * Composition entry point for the daily pricing sync cron.
 *
 * The cron route handler in `app/api/cron/pricing-sync/route.ts` only sees
 * use cases per the ESLint boundary rules — it is forbidden from reaching
 * into infrastructure directly. This file wires concrete adapters (drizzle
 * repo + provider sources) and exposes a single async entry point that
 * returns the run summary.
 *
 * Network failure on one provider does not abort the run; the underlying
 * `syncPricing` use case catches per-source errors and reports them via
 * `failedProviders` in the summary.
 */

import "server-only";

import { db } from "@/lib/db";
import { drizzlePricingRepository } from "./drizzle-pricing.repository";
import { litellmPricingSource } from "./litellm-pricing-source.adapter";
import { syncPricing, type SyncSummary } from "./sync-pricing.usecase";

export async function runPricingSync(now: Date = new Date()): Promise<SyncSummary> {
    const repo = drizzlePricingRepository(db());
    return syncPricing([litellmPricingSource], repo, now);
}
