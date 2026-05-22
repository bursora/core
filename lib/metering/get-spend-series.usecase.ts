/**
 * getSpendSeries — read-side orchestrator for the spend-over-time chart.
 *
 * Takes an explicit `{from, to}` window and asks the repository to aggregate
 * cost_usd by bucket + facet value. Null facet values are surfaced under the
 * `(untagged)` literal so customers can find call sites that forgot to pass
 * tags.
 *
 * Bucket size is derived from the span (to − from):
 *   - span <  2h → 5min   (300s)
 *   - span <  2d → 1h     (3600s)
 *   - else       → 1d     (86400s)
 *
 * Cost arithmetic: cost_usd is a decimal string with 8 fractional digits to
 * match `numeric(14,8)`. We sum using BigInt at scale 1e8 so totals stay
 * exact; the result is re-formatted to the same string shape.
 */

import type {
    MeteringFilters,
    MeteringReadRepository,
    MeteringStatusFilter,
} from "./metering-read.repository";
import type { Facet, FacetedSeries, SeriesPoint, SpendWindow } from "./spend-series";

export interface GetSpendSeriesInput extends MeteringFilters {
    readonly workspaceId: string;
    readonly facet: Facet;
    readonly from: Date;
    readonly to: Date;
    readonly repo: MeteringReadRepository;
    readonly scopeId?: string | undefined;
    readonly status?: MeteringStatusFilter | undefined;
}

export interface DerivedWindow {
    readonly windowStart: Date;
    readonly windowEnd: Date;
    readonly bucketSeconds: number;
}

const BUCKET_5MIN = 300;
const BUCKET_1H = 3600;
const BUCKET_1D = 86400;

export const deriveWindow = (window: SpendWindow): DerivedWindow => {
    const span = window.to.getTime() - window.from.getTime();
    const bucketSeconds =
        span < 2 * 60 * 60 * 1000
            ? BUCKET_5MIN
            : span < 2 * 24 * 60 * 60 * 1000
              ? BUCKET_1H
              : BUCKET_1D;
    return { windowStart: window.from, windowEnd: window.to, bucketSeconds };
};

const SCALE = 100_000_000n;

const toScaled = (s: string): bigint => {
    const [whole, frac = ""] = s.split(".");
    const padded = (frac + "00000000").slice(0, 8);
    const sign = whole?.startsWith("-") ? -1n : 1n;
    const wholeAbs = (whole ?? "0").replace("-", "");
    return sign * (BigInt(wholeAbs) * SCALE + BigInt(padded));
};

const fromScaled = (n: bigint): string => {
    const sign = n < 0n ? "-" : "";
    const abs = n < 0n ? -n : n;
    const whole = abs / SCALE;
    const frac = abs % SCALE;
    return `${sign}${whole.toString()}.${frac.toString().padStart(8, "0")}`;
};

const ZERO_USD = "0.00000000";

export async function getSpendSeriesUseCase(input: GetSpendSeriesInput): Promise<FacetedSeries> {
    const { windowStart, windowEnd, bucketSeconds } = deriveWindow({
        from: input.from,
        to: input.to,
    });

    const raw = await input.repo.spendSeries({
        workspaceId: input.workspaceId,
        facet: input.facet,
        windowStart,
        windowEnd,
        bucketSeconds,
        scopeId: input.scopeId,
        status: input.status,
        provider: input.provider,
        tenantId: input.tenantId,
        agentId: input.agentId,
        workflowId: input.workflowId,
        model: input.model,
    });

    if (raw.length === 0 || windowStart.getTime() >= windowEnd.getTime()) {
        return {
            facet: input.facet,
            from: input.from,
            to: input.to,
            points: [],
            totalUsd: ZERO_USD,
            totalCalls: 0,
            bucketSeconds,
        };
    }

    const tags = new Set<string>();
    const byBucket = new Map<number, Map<string, { costUsd: string; callCount: number }>>();
    let totalCalls = 0;
    let totalScaled = 0n;
    for (const p of raw) {
        tags.add(p.tag);
        totalCalls += p.callCount;
        totalScaled += toScaled(p.costUsd);
        const key = p.bucket.getTime();
        let inner = byBucket.get(key);
        if (inner === undefined) {
            inner = new Map();
            byBucket.set(key, inner);
        }
        inner.set(p.tag, { costUsd: p.costUsd, callCount: p.callCount });
    }

    // Align to bucket boundaries the same way the SQL aggregation does.
    const bucketMs = bucketSeconds * 1000;
    const alignedStartMs = Math.floor(windowStart.getTime() / bucketMs) * bucketMs;
    const endMs = windowEnd.getTime();

    const filled: SeriesPoint[] = [];
    const sortedTags = [...tags].sort();
    for (let t = alignedStartMs; t < endMs; t += bucketMs) {
        const inner = byBucket.get(t);
        for (const tag of sortedTags) {
            const cell = inner?.get(tag);
            filled.push({
                bucket: new Date(t),
                tag,
                costUsd: cell?.costUsd ?? ZERO_USD,
                callCount: cell?.callCount ?? 0,
            });
        }
    }

    return {
        facet: input.facet,
        from: input.from,
        to: input.to,
        points: filled,
        totalUsd: fromScaled(totalScaled),
        totalCalls,
        bucketSeconds,
    };
}
