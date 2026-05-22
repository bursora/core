/**
 * Pure aggregation that powers the spend chart. Takes raw SeriesPoints and
 * produces one row per bucket with one value field per visible tag plus a
 * total call count (`__calls`) used by the tooltip.
 *
 * The `metric` option pivots the value field: `'cost'` (default) sums
 * `costUsd`; `'count'` sums `callCount`. When the dashboard's status filter
 * is anything other than `'ok'`, cost goes to zero everywhere — count is the
 * meaningful axis.
 *
 * Top-N is applied here: the N highest-value tags survive individually, the
 * rest are bucketed under `OTHER_KEY`. `hasOther` lets the chart caption say
 * "remaining grouped as Other".
 */

import type { SeriesPoint } from "@/lib/metering";

export interface ChartRow {
    readonly t: number;
    readonly __calls: number;
    readonly [tag: string]: number;
}

export const OTHER_KEY = "Other";
export const MAX_VISIBLE_TAGS = 6;

export type ChartMetric = "cost" | "count";

interface ParsedPoint {
    readonly t: number;
    readonly tag: string;
    readonly value: number;
    readonly callCount: number;
}

export interface BuildRowsOptions {
    readonly metric?: ChartMetric;
}

export function buildRows(
    points: readonly SeriesPoint[],
    options: BuildRowsOptions = {},
): {
    rows: ChartRow[];
    tags: string[];
    hasOther: boolean;
} {
    if (points.length === 0) return { rows: [], tags: [], hasOther: false };

    const metric: ChartMetric = options.metric ?? "cost";

    const parsed: ParsedPoint[] = [];
    const totalsByTag = new Map<string, number>();
    for (const p of points) {
        const value = metric === "cost" ? Number.parseFloat(p.costUsd) : p.callCount;
        parsed.push({ t: p.bucket.getTime(), tag: p.tag, value, callCount: p.callCount });
        totalsByTag.set(p.tag, (totalsByTag.get(p.tag) ?? 0) + value);
    }

    const ranked = Array.from(totalsByTag.entries()).sort(([, a], [, b]) => b - a);
    const visible = ranked.slice(0, MAX_VISIBLE_TAGS).map(([tag]) => tag);
    const visibleSet = new Set(visible);
    const hasOther = ranked.length > MAX_VISIBLE_TAGS;
    const tags = hasOther ? [...visible, OTHER_KEY] : visible;

    const byTime = new Map<number, { values: Record<string, number>; calls: number }>();
    for (const p of parsed) {
        let row = byTime.get(p.t);
        if (row === undefined) {
            row = { values: {}, calls: 0 };
            byTime.set(p.t, row);
        }
        const key = visibleSet.has(p.tag) ? p.tag : OTHER_KEY;
        row.values[key] = (row.values[key] ?? 0) + p.value;
        row.calls += p.callCount;
    }

    const rows: ChartRow[] = Array.from(byTime.entries())
        .sort(([a], [b]) => a - b)
        .map(([t, row]) => {
            const filled: Record<string, number> = { t, __calls: row.calls };
            for (const tag of tags) filled[tag] = row.values[tag] ?? 0;
            return filled as ChartRow;
        });

    return { rows, tags, hasOther };
}
