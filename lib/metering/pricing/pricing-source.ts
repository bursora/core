/**
 * Port for a provider pricing scraper.
 *
 * Each `PricingSource` fetches one provider's current rate sheet and returns
 * `ScrapedRate` rows. `provider` identifies the source so a failed run is
 * attributed by name in the sync summary.
 */

export interface ScrapedRate {
    provider: string;
    model: string;
    region: string;
    inputPer1mUsd: string;
    outputPer1mUsd: string;
    cachePer1mUsd: string | null;
}

export interface PricingSource {
    readonly provider: string;
    fetchRates(): Promise<ScrapedRate[]>;
}
