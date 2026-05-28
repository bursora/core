/**
 * Sync pricing use case.
 *
 * For each provider source: fetch its current rates, then for each rate look
 * up the latest GLOBAL row (workspace_id IS NULL). If the rate matches → no-op.
 * If it differs → atomically close the previous row and insert a new one. If
 * no prior row exists → insert directly.
 *
 * Workspace-scoped override rows are NEVER touched by this flow — the repo's
 * `findLatestGlobal` filters them out.
 *
 * Per-source failures are collected so siblings still process; once all
 * sources are tried, if any failed the use case throws
 * `PricingSyncPartialFailure`. The throw is what surfaces the failure to the
 * cron runner (route → 500 → scheduler retry/page). Silently returning
 * "success with failedProviders=[...]" used to hide stale-rate windows.
 *
 * On a fully successful run, the optional `recordHeartbeat` callback fires
 * with `now` so the operator can observe a freshness signal.
 */

import type { NewPricingRow, PricingRepository } from "./pricing-row";
import type { PricingSource, ScrapedRate } from "./pricing-source";

export interface SyncSummary {
    inserted: number;
    unchanged: number;
}

export type SyncPricingRepo = Pick<
    PricingRepository,
    "findLatestGlobal" | "closeAndInsert" | "insert"
>;

export type HeartbeatRecorder = (now: Date) => Promise<void>;

export interface SyncPricingOptions {
    recordHeartbeat?: HeartbeatRecorder;
}

/**
 * Thrown when one or more pricing sources fail during a sync run. The cron
 * route surfaces this as a 500 with the structured `failedProviders` list so
 * the scheduler can retry / page the operator.
 */
export class PricingSyncPartialFailure extends Error {
    readonly failedProviders: readonly string[];

    constructor(failedProviders: readonly string[]) {
        super(`pricing sync failed for providers: ${failedProviders.join(", ")}`);
        this.name = "PricingSyncPartialFailure";
        this.failedProviders = failedProviders;
    }
}

export async function syncPricing(
    sources: readonly PricingSource[],
    repo: SyncPricingRepo,
    now: Date,
    options: SyncPricingOptions = {},
): Promise<SyncSummary> {
    const summary: SyncSummary = {
        inserted: 0,
        unchanged: 0,
    };
    const failedProviders: string[] = [];

    for (const source of sources) {
        let rates: ScrapedRate[];
        try {
            rates = await source.fetchRates();
        } catch (error: unknown) {
            failedProviders.push(source.provider);
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`pricing-sync.source_failed`, {
                provider: source.provider,
                message,
            });
            continue;
        }

        for (const rate of rates) {
            const current = await repo.findLatestGlobal(rate.provider, rate.model, rate.region);

            if (current === null) {
                await repo.insert(toNewRow(rate, now));
                summary.inserted += 1;
                continue;
            }

            if (sameRate(current, rate)) {
                summary.unchanged += 1;
                continue;
            }

            await repo.closeAndInsert(current.id, now, toNewRow(rate, now));
            summary.inserted += 1;
        }
    }

    if (failedProviders.length > 0) {
        throw new PricingSyncPartialFailure(failedProviders);
    }

    if (options.recordHeartbeat) {
        await options.recordHeartbeat(now);
    }

    return summary;
}

const toNewRow = (rate: ScrapedRate, effectiveFrom: Date): NewPricingRow => ({
    provider: rate.provider,
    model: rate.model,
    region: rate.region,
    inputPer1mUsd: rate.inputPer1mUsd,
    outputPer1mUsd: rate.outputPer1mUsd,
    cachePer1mUsd: rate.cachePer1mUsd,
    effectiveFrom,
});

const sameRate = (
    current: { inputPer1mUsd: string; outputPer1mUsd: string; cachePer1mUsd: string | null },
    scraped: ScrapedRate,
): boolean =>
    decimalEquals(current.inputPer1mUsd, scraped.inputPer1mUsd) &&
    decimalEquals(current.outputPer1mUsd, scraped.outputPer1mUsd) &&
    decimalEquals(current.cachePer1mUsd, scraped.cachePer1mUsd);

const decimalEquals = (a: string | null, b: string | null): boolean => {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return Number.parseFloat(a) === Number.parseFloat(b);
};
