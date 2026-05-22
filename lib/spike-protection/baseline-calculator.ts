/**
 * Pure 7-day weighted baseline calculator.
 *
 * Inputs: a series of per-minute event counts spanning up to 7 days. The
 * calculator weights recent samples heavier than older ones — a workspace
 * whose traffic doubled this week should see the new normal reflected
 * within a day or two, not after the full 7-day buffer rolls over.
 *
 * Weight schedule (older → newer):
 *   day 6: 1, day 5: 2, day 4: 3, day 3: 4, day 2: 6, day 1: 8, day 0: 10.
 *
 * The function:
 *   1. Splits the series into 7 day-sized chunks (oldest first).
 *   2. Computes each day's mean events/min.
 *   3. Returns the weighted average of those means.
 *
 * Empty or all-zero input returns 0 — meaning "no baseline; the middleware
 * should not invoke spike protection at this point".
 */

import "server-only";

const MINUTES_PER_DAY = 24 * 60;
const DAY_WEIGHTS = [1, 2, 3, 4, 6, 8, 10] as const;

export function calculate7DayWeightedBaseline(series: readonly number[]): number {
    if (series.length === 0) return 0;

    // Trim or pad to exactly 7 days * MINUTES_PER_DAY samples.
    const required = DAY_WEIGHTS.length * MINUTES_PER_DAY;
    const padded =
        series.length >= required
            ? series.slice(series.length - required)
            : padLeading(series, required);

    const dayMeans: number[] = [];
    for (let day = 0; day < DAY_WEIGHTS.length; day++) {
        const start = day * MINUTES_PER_DAY;
        const slice = padded.slice(start, start + MINUTES_PER_DAY);
        dayMeans.push(mean(slice));
    }

    let weightedSum = 0;
    let weightTotal = 0;
    for (let day = 0; day < dayMeans.length; day++) {
        const weight = DAY_WEIGHTS[day] ?? 1;
        const value = dayMeans[day] ?? 0;
        weightedSum += value * weight;
        weightTotal += weight;
    }
    if (weightTotal === 0) return 0;
    return weightedSum / weightTotal;
}

function mean(values: readonly number[]): number {
    if (values.length === 0) return 0;
    let total = 0;
    for (const v of values) total += v;
    return total / values.length;
}

function padLeading(series: readonly number[], targetLength: number): number[] {
    const pad = targetLength - series.length;
    if (pad <= 0) return series.slice();
    const padded = new Array<number>(pad).fill(0);
    return padded.concat(series);
}
