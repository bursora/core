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

export const isRowStatus = (value: string): value is RowStatus =>
    (["active", "scheduled", "expired"] as readonly string[]).includes(value);

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

/** Server-side page size for the pricing table. */
export const DEFAULT_PRICING_PAGE_SIZE = 100;

/** URL search-param keys that drive the pricing table's filters and page. */
export const PRICING_PARAMS = {
    search: "pricing_q",
    provider: "pricing_provider",
    status: "pricing_status",
    source: "pricing_source",
    page: "pricing_page",
} as const;

export interface ParsedPricingParams {
    readonly search: string;
    readonly source: SourceFilter;
    readonly provider: string;
    readonly status: ReadonlySet<RowStatus>;
    readonly page: number;
}

/**
 * Reads the pricing table's filter + page state from URL params. Shared by the
 * server component (which filters/paginates) and the client panel (which shows
 * the matching control state), so both agree on a single source of truth.
 * Absent status defaults to active-only — the table opens on what's live now.
 */
export function parsePricingSearch(params: URLSearchParams): ParsedPricingParams {
    const search = params.get(PRICING_PARAMS.search)?.trim() ?? "";
    const sourceRaw = params.get(PRICING_PARAMS.source);
    const source: SourceFilter =
        sourceRaw === "global" || sourceRaw === "override" ? sourceRaw : "all";
    const provider = params.get(PRICING_PARAMS.provider) ?? "all";
    const statusRaw = params.get(PRICING_PARAMS.status);
    const status: ReadonlySet<RowStatus> =
        statusRaw === null
            ? new Set<RowStatus>(["active"])
            : new Set(statusRaw.split(",").filter(isRowStatus));
    const pageRaw = Number.parseInt(params.get(PRICING_PARAMS.page) ?? "1", 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    return { search, source, provider, status, page };
}

export interface PricingPage {
    /** Current page of rows, filtered then sorted. */
    readonly rows: ReadonlyArray<PricingRowView>;
    /** Grand totals across every row, ignoring filters (drives stat tiles). */
    readonly counts: PricingRowCounts;
    /** Distinct providers across every row, sorted (drives the provider filter). */
    readonly providers: readonly string[];
    /** Count of rows matching the filters, across all pages. */
    readonly total: number;
    /** Clamped 1-based page index. */
    readonly page: number;
    readonly pageCount: number;
}

/**
 * Filters, sorts, and slices the full pricing set into one page. Runs on the
 * server so the browser only ever holds a single page of rows.
 */
export function buildPricingPage(
    allRows: ReadonlyArray<PricingRowView>,
    parsed: ParsedPricingParams,
    now: number,
    pageSize: number = DEFAULT_PRICING_PAGE_SIZE,
): PricingPage {
    const counts = summarizePricingRows(allRows);
    const providers = Array.from(new Set(allRows.map((r) => r.provider))).sort();
    const filtered = sortRows(
        filterRows(
            allRows,
            {
                search: parsed.search,
                source: parsed.source,
                provider: parsed.provider,
                status: parsed.status,
            },
            now,
        ),
        now,
    );
    const total = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(parsed.page, pageCount);
    const start = (page - 1) * pageSize;
    return {
        rows: filtered.slice(start, start + pageSize),
        counts,
        providers,
        total,
        page,
        pageCount,
    };
}

export type PageToken = number | "ellipsis";

/**
 * Page numbers to render: always first and last, the current page with one
 * neighbour either side, and "ellipsis" gaps. Returns every page when there
 * are few enough to show without truncation.
 */
export function pageWindow(page: number, pageCount: number): readonly PageToken[] {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
    const tokens: PageToken[] = [1];
    const left = Math.max(2, page - 1);
    const right = Math.min(pageCount - 1, page + 1);
    if (left > 2) tokens.push("ellipsis");
    for (let p = left; p <= right; p += 1) tokens.push(p);
    if (right < pageCount - 1) tokens.push("ellipsis");
    tokens.push(pageCount);
    return tokens;
}
