/**
 * Pure helpers for the /spend "Peak day" KPI tile.
 *
 * The faceted spend series buckets points by (tag, bucket-start). Buckets may
 * be sub-day, so `computePeakDay` collapses points into UTC dates first, then
 * picks the highest-total date. Returns `null` when the series is empty so
 * the caller can render a "—" placeholder rather than `$0` for an unknown day.
 */

import type { SeriesPoint } from "@/lib/metering";

export interface PeakDay {
    /** UTC midnight of the peak date. */
    readonly date: Date;
    /** Total spend in USD for that date. */
    readonly total: number;
}

const MS_PER_DAY = 86_400_000;

function utcDateKey(bucket: Date): number {
    return Math.floor(bucket.getTime() / MS_PER_DAY);
}

export function computePeakDay(points: readonly SeriesPoint[]): PeakDay | null {
    if (points.length === 0) return null;

    const byDay = new Map<number, number>();
    for (const p of points) {
        const cost = Number.parseFloat(p.costUsd);
        if (!Number.isFinite(cost) || cost === 0) continue;
        const key = utcDateKey(p.bucket);
        byDay.set(key, (byDay.get(key) ?? 0) + cost);
    }

    if (byDay.size === 0) return null;

    let peakKey = -1;
    let peakTotal = -1;
    for (const [key, total] of byDay) {
        if (total > peakTotal) {
            peakKey = key;
            peakTotal = total;
        }
    }

    return {
        date: new Date(peakKey * MS_PER_DAY),
        total: peakTotal,
    };
}
