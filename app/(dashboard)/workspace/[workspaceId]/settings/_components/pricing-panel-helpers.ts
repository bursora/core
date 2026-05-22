import { oneOf } from "@/lib/type-guards";

interface PricingRowViewBase {
    readonly provider: string;
    readonly model: string;
    readonly region: string;
    readonly inputPer1mUsd: string;
    readonly outputPer1mUsd: string;
    readonly cachePer1mUsd: string | null;
    readonly effectiveFrom: string;
    readonly effectiveTo: string | null;
}

export interface PricingRowGlobalView extends PricingRowViewBase {
    readonly source: "global";
    readonly overrideId: null;
}

export interface PricingRowOverrideView extends PricingRowViewBase {
    readonly source: "override";
    readonly overrideId: string;
}

export type PricingRowView = PricingRowGlobalView | PricingRowOverrideView;

export interface PricingFormInitialValues {
    readonly provider: string;
    readonly model: string;
    readonly region: string;
    readonly inputPer1mUsd: string;
    readonly outputPer1mUsd: string;
    readonly cachePer1mUsd: string;
    /** Empty/undefined lets the form default to `nowLocalIso()`. */
    readonly effectiveFrom?: string;
    readonly effectiveTo?: string;
}

export type RowStatus = "active" | "scheduled" | "expired";

export const isRowStatus = oneOf(["active", "scheduled", "expired"] as const);

export interface PricingRowCounts {
    readonly global: number;
    readonly override: number;
    readonly total: number;
}

function toLocalInputValue(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const tz = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export function toEditInitialValues(row: PricingRowView): PricingFormInitialValues {
    const base = {
        provider: row.provider,
        model: row.model,
        region: row.region,
        inputPer1mUsd: row.inputPer1mUsd,
        outputPer1mUsd: row.outputPer1mUsd,
        cachePer1mUsd: row.cachePer1mUsd ?? "",
    };
    // Global rows: omit the effective window so the form's `nowLocalIso()`
    // default fills `From`. Submitting then creates a fresh override.
    if (row.source === "global") return base;
    return {
        ...base,
        effectiveFrom: toLocalInputValue(row.effectiveFrom),
        effectiveTo: row.effectiveTo === null ? "" : toLocalInputValue(row.effectiveTo),
    };
}

export function summarizePricingRows(rows: ReadonlyArray<PricingRowView>): PricingRowCounts {
    let global = 0;
    let override = 0;
    for (const r of rows) {
        if (r.source === "global") global += 1;
        else override += 1;
    }
    return { global, override, total: global + override };
}

export function rowStatus(row: PricingRowView, now: number): RowStatus {
    const from = new Date(row.effectiveFrom).getTime();
    const to = row.effectiveTo === null ? null : new Date(row.effectiveTo).getTime();
    if (from > now) return "scheduled";
    if (to !== null && to <= now) return "expired";
    return "active";
}

const SOURCE_RANK: Record<PricingRowView["source"], number> = {
    override: 0,
    global: 1,
};

const STATUS_RANK: Record<RowStatus, number> = {
    active: 0,
    scheduled: 1,
    expired: 2,
};

export type SourceFilter = "all" | "global" | "override";

export interface FilterCriteria {
    readonly search?: string;
    readonly source?: SourceFilter;
    readonly provider?: string;
    readonly status?: ReadonlySet<RowStatus>;
}

export function filterRows(
    rows: ReadonlyArray<PricingRowView>,
    criteria: FilterCriteria,
    now: number = Date.now(),
): ReadonlyArray<PricingRowView> {
    const q = criteria.search?.trim().toLowerCase() ?? "";
    const source = criteria.source ?? "all";
    const provider = criteria.provider ?? "all";
    const filterBySource = source !== "all";
    const filterByProvider = provider !== "all";
    const statusSet = criteria.status;
    if (statusSet === undefined && q === "" && !filterBySource && !filterByProvider) return rows;
    return rows.filter((r) => {
        if (filterBySource && r.source !== source) return false;
        if (filterByProvider && r.provider !== provider) return false;
        if (statusSet !== undefined && !statusSet.has(rowStatus(r, now))) return false;
        if (q === "") return true;
        return r.model.toLowerCase().includes(q) || r.provider.toLowerCase().includes(q);
    });
}

export function sortRows(
    rows: ReadonlyArray<PricingRowView>,
    now: number,
): ReadonlyArray<PricingRowView> {
    const decorated = rows.map((row) => ({ row, statusRank: STATUS_RANK[rowStatus(row, now)] }));
    decorated.sort((a, b) => {
        const src = SOURCE_RANK[a.row.source] - SOURCE_RANK[b.row.source];
        if (src !== 0) return src;
        const status = a.statusRank - b.statusRank;
        if (status !== 0) return status;
        if (a.row.provider !== b.row.provider) return a.row.provider < b.row.provider ? -1 : 1;
        if (a.row.model !== b.row.model) return a.row.model < b.row.model ? -1 : 1;
        return 0;
    });
    return decorated.map((d) => d.row);
}
