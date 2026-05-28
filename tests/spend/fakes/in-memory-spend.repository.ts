/**
 * In-memory parity for `SpendRepository`. Cost math uses bigint scaled to
 * 1e8 to match `numeric(14,8)` deterministically, mirroring the existing
 * in-memory metering read repository.
 */

import type { UsageEventRow } from "@/lib/metering";
import type {
    MeteringFilters,
    MeteringStatusFilter,
} from "@/lib/metering/metering-read.repository";
import type { Facet, SeriesPoint } from "@/lib/metering/spend-series";
import type {
    GetSpendForScopeInput,
    GetSpendSeriesInput,
    SpendRepository,
} from "@/lib/spend/repository";

const SCALE = 100_000_000n;

const facetValue = (facet: Facet, row: UsageEventRow): string | null => {
    switch (facet) {
        case "tenant":
            return row.tenantId;
        case "agent":
            return row.agentId;
        case "workflow":
            return row.workflowId;
        case "model":
            return row.model;
    }
};

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

const bucketStart = (ts: Date, bucketSeconds: number): Date => {
    const sizeMs = bucketSeconds * 1000;
    const k = Math.floor(ts.getTime() / sizeMs);
    return new Date(k * sizeMs);
};

const matchesStatus = (row: UsageEventRow, status: MeteringStatusFilter): boolean => {
    if (status === "both") return true;
    return (row.status ?? "ok") === status;
};

const matchesFilters = (row: UsageEventRow, filters: MeteringFilters | undefined): boolean => {
    if (filters === undefined) return true;
    const inList = (arr: readonly string[] | undefined, val: string | null): boolean =>
        arr === undefined || arr.length === 0 || (val !== null && arr.includes(val));
    if (!inList(filters.provider, row.provider)) return false;
    if (!inList(filters.tenantId, row.tenantId)) return false;
    if (!inList(filters.agentId, row.agentId)) return false;
    if (!inList(filters.workflowId, row.workflowId)) return false;
    if (!inList(filters.model, row.model)) return false;
    return true;
};

const matchesScope = (row: UsageEventRow, input: GetSpendForScopeInput): boolean => {
    if (input.scopeType === "workspace") return true;
    if (input.scopeId === null) return true;
    switch (input.scopeType) {
        case "tenant":
            return row.tenantId === input.scopeId;
        case "agent":
            return row.agentId === input.scopeId;
        case "workflow":
            return row.workflowId === input.scopeId;
    }
};

export class InMemorySpendRepository implements SpendRepository {
    private readonly stored: UsageEventRow[] = [];

    add(row: UsageEventRow): void {
        this.stored.push(row);
    }

    async getSpendForScope(input: GetSpendForScopeInput): Promise<number> {
        let total = 0n;
        for (const row of this.stored) {
            if (row.workspaceId !== input.workspaceId) continue;
            if (row.ts < input.from) continue;
            if (row.ts >= input.to) continue;
            if (!matchesStatus(row, input.status)) continue;
            if (!matchesFilters(row, input.filters)) continue;
            if (!matchesScope(row, input)) continue;
            total += toScaled(row.costUsd);
        }
        return Number(total) / Number(SCALE);
    }

    async getSpendSeries(input: GetSpendSeriesInput): Promise<readonly SeriesPoint[]> {
        const groups = new Map<
            string,
            { bucket: Date; tag: string | null; sum: bigint; callCount: number }
        >();

        for (const row of this.stored) {
            if (row.workspaceId !== input.workspaceId) continue;
            if (row.ts < input.windowStart) continue;
            if (row.ts >= input.windowEnd) continue;
            if (!matchesStatus(row, input.status)) continue;
            if (!matchesFilters(row, input.filters)) continue;

            const tag = facetValue(input.facet, row);
            if (input.scopeId !== undefined && tag !== input.scopeId) continue;
            const bucket = bucketStart(row.ts, input.bucketSeconds);
            const key = `${bucket.toISOString()}|${tag ?? ""}`;

            const existing = groups.get(key);
            const cost = toScaled(row.costUsd);
            if (existing === undefined) {
                groups.set(key, { bucket, tag, sum: cost, callCount: 1 });
            } else {
                existing.sum += cost;
                existing.callCount += 1;
            }
        }

        const points: SeriesPoint[] = [];
        for (const { bucket, tag, sum, callCount } of groups.values()) {
            points.push({
                bucket,
                tag: tag ?? "(untagged)",
                costUsd: fromScaled(sum),
                callCount,
            });
        }

        points.sort((a, b) => {
            const t = a.bucket.getTime() - b.bucket.getTime();
            if (t !== 0) return t;
            return a.tag.localeCompare(b.tag);
        });

        return points;
    }
}
