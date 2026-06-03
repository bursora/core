/**
 * Pure helpers for the /spend "Peak day" KPI tile.
 *
 * The faceted spend series buckets points by (tag, bucket-start). Buckets may
 * be sub-day, so `computePeakDay` collapses points into the viewer's local-zone
 * days first, then picks the highest-total day — matching the local-day windows
 * the rest of the page uses. Returns `null` when the series is empty so the
 * caller can render a "—" placeholder rather than `$0` for an unknown day.
 */

import type { SeriesPoint } from "@/lib/metering";
import { startOfDayInZone } from "@/lib/time/zone";

export interface PeakDay {
    /** Start of the peak day in `tz`, as a UTC instant. */
    readonly date: Date;
    /** Total spend in USD for that day. */
    readonly total: number;
}

export function computePeakDay(points: readonly SeriesPoint[], tz: string): PeakDay | null {
    if (points.length === 0) return null;

    const byDay = new Map<number, number>();
    for (const p of points) {
        const cost = Number.parseFloat(p.costUsd);
        if (!Number.isFinite(cost) || cost === 0) continue;
        const key = startOfDayInZone(p.bucket, tz).getTime();
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
        date: new Date(peakKey),
        total: peakTotal,
    };
}
