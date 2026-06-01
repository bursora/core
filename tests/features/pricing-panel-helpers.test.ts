import {
    buildPricingPage,
    DEFAULT_PRICING_PAGE_SIZE,
    filterRows,
    pageWindow,
    parsePricingSearch,
    rowStatus,
    sortRows,
    summarizePricingRows,
    toEditInitialValues,
    type PricingRowView,
    type RowStatus,
} from "@/app/(dashboard)/workspace/[workspaceId]/settings/_components/pricing-panel-helpers";
import { describe, expect, test } from "bun:test";

const globalRow: PricingRowView = {
    source: "global",
    overrideId: null,
    provider: "openai",
    model: "gpt-4o",
    region: "global",
    inputPer1mUsd: "0.0025",
    outputPer1mUsd: "0.01",
    cachePer1mUsd: "0.00125",
    effectiveFrom: "2024-01-01T00:00:00.000Z",
    effectiveTo: null,
};

const overrideRow: PricingRowView = {
    source: "override",
    overrideId: "ovr-1",
    provider: "openai",
    model: "gpt-4o",
    region: "us",
    inputPer1mUsd: "0.0020",
    outputPer1mUsd: "0.0080",
    cachePer1mUsd: null,
    effectiveFrom: "2025-01-01T00:00:00.000Z",
    effectiveTo: "2025-12-31T00:00:00.000Z",
};

function mkRow(overrides: Partial<PricingRowView>): PricingRowView {
    const base = {
        source: "global" as const,
        overrideId: null,
        provider: "openai",
        model: "gpt-4o",
        region: "global",
        inputPer1mUsd: "0.0025",
        outputPer1mUsd: "0.01",
        cachePer1mUsd: null,
        effectiveFrom: "2024-01-01T00:00:00.000Z",
        effectiveTo: null,
    } satisfies PricingRowView;
    return { ...base, ...overrides } as PricingRowView;
}

describe("toEditInitialValues", () => {
    test("global row copies rates but omits effective window so form defaults to now", () => {
        const values = toEditInitialValues(globalRow);

        expect(values.provider).toBe("openai");
        expect(values.model).toBe("gpt-4o");
        expect(values.region).toBe("global");
        expect(values.inputPer1mUsd).toBe("0.0025");
        expect(values.outputPer1mUsd).toBe("0.01");
        expect(values.cachePer1mUsd).toBe("0.00125");
        // Effective window must be undefined (not ""), so the form's
        // nowLocalIso() default kicks in.
        expect(values.effectiveFrom).toBeUndefined();
        expect(values.effectiveTo).toBeUndefined();
    });

    test("override row carries the full effective window as datetime-local strings", () => {
        const values = toEditInitialValues(overrideRow);

        expect(values.inputPer1mUsd).toBe("0.0020");
        expect(values.outputPer1mUsd).toBe("0.0080");
        expect(values.cachePer1mUsd).toBe("");
        // Local datetime strings are 16 chars: YYYY-MM-DDTHH:mm
        expect(values.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
        expect(values.effectiveTo).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    test("override row with null cache rate yields empty cache field", () => {
        const values = toEditInitialValues(overrideRow);
        expect(values.cachePer1mUsd).toBe("");
    });

    test("override row with null effectiveTo yields empty effectiveTo but keeps effectiveFrom", () => {
        const indefinite: PricingRowView = { ...overrideRow, effectiveTo: null };
        const values = toEditInitialValues(indefinite);
        expect(values.effectiveTo).toBe("");
        // effectiveFrom is still the override's start, formatted as a
        // datetime-local string (YYYY-MM-DDTHH:mm).
        expect(values.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });
});

describe("summarizePricingRows", () => {
    test("counts globals and overrides separately", () => {
        const counts = summarizePricingRows([globalRow, overrideRow, overrideRow]);
        expect(counts.global).toBe(1);
        expect(counts.override).toBe(2);
        expect(counts.total).toBe(3);
    });

    test("empty input yields zero counts", () => {
        const counts = summarizePricingRows([]);
        expect(counts.global).toBe(0);
        expect(counts.override).toBe(0);
        expect(counts.total).toBe(0);
    });
});

describe("rowStatus", () => {
    const now = new Date("2025-06-01T00:00:00Z").getTime();

    test("returns 'active' when now sits inside the window", () => {
        expect(rowStatus(overrideRow, now)).toBe("active");
    });

    test("returns 'scheduled' when effectiveFrom is in the future", () => {
        const future: PricingRowView = {
            ...overrideRow,
            effectiveFrom: "2030-01-01T00:00:00.000Z",
        };
        expect(rowStatus(future, now)).toBe("scheduled");
    });

    test("returns 'expired' when effectiveTo is in the past", () => {
        const past: PricingRowView = {
            ...overrideRow,
            effectiveFrom: "2023-01-01T00:00:00.000Z",
            effectiveTo: "2024-01-01T00:00:00.000Z",
        };
        expect(rowStatus(past, now)).toBe("expired");
    });

    test("treats null effectiveTo as indefinite (active)", () => {
        expect(rowStatus(globalRow, now)).toBe("active");
    });
});

describe("sortRows", () => {
    const now = new Date("2025-06-01T00:00:00Z").getTime();
    const mk = mkRow;

    test("sorts override rows before global rows", () => {
        const g = mk({ source: "global", overrideId: null });
        const o = mk({ source: "override", overrideId: "ovr-1" });

        const sorted = sortRows([g, o], now);

        expect(sorted.map((r) => r.source)).toEqual(["override", "global"]);
    });

    test("within same source, active rows come before scheduled, then expired", () => {
        const expired = mk({
            source: "override",
            overrideId: "ovr-expired",
            effectiveFrom: "2023-01-01T00:00:00.000Z",
            effectiveTo: "2024-01-01T00:00:00.000Z",
        });
        const scheduled = mk({
            source: "override",
            overrideId: "ovr-scheduled",
            effectiveFrom: "2030-01-01T00:00:00.000Z",
            effectiveTo: null,
        });
        const active = mk({
            source: "override",
            overrideId: "ovr-active",
            effectiveFrom: "2024-01-01T00:00:00.000Z",
            effectiveTo: null,
        });

        const sorted = sortRows([expired, scheduled, active], now);

        expect(sorted.map((r) => r.overrideId)).toEqual([
            "ovr-active",
            "ovr-scheduled",
            "ovr-expired",
        ]);
    });

    test("breaks ties on provider ascending", () => {
        const anthropic = mk({ provider: "anthropic" });
        const openai = mk({ provider: "openai" });

        const sorted = sortRows([openai, anthropic], now);

        expect(sorted.map((r) => r.provider)).toEqual(["anthropic", "openai"]);
    });

    test("breaks remaining ties on model ascending", () => {
        const gpt4o = mk({ model: "gpt-4o" });
        const gpt35 = mk({ model: "gpt-3.5-turbo" });

        const sorted = sortRows([gpt4o, gpt35], now);

        expect(sorted.map((r) => r.model)).toEqual(["gpt-3.5-turbo", "gpt-4o"]);
    });

    test("is stable on already-sorted input and returns a new array", () => {
        const a = mk({
            source: "override",
            overrideId: "a",
            provider: "anthropic",
            model: "claude",
        });
        const b = mk({
            source: "override",
            overrideId: "b",
            provider: "openai",
            model: "gpt-4o",
        });
        const c = mk({ source: "global", overrideId: null, provider: "openai", model: "gpt-4o" });
        const input = [a, b, c];

        const sorted = sortRows(input, now);

        expect(sorted).not.toBe(input);
        expect(sorted.map((r) => r.overrideId ?? `g:${r.provider}|${r.model}`)).toEqual([
            "a",
            "b",
            "g:openai|gpt-4o",
        ]);
        // input untouched
        expect(input.map((r) => r.overrideId ?? `g:${r.provider}|${r.model}`)).toEqual([
            "a",
            "b",
            "g:openai|gpt-4o",
        ]);
    });
});

describe("filterRows", () => {
    const mk = mkRow;

    const gpt4o = mk({ model: "gpt-4o", provider: "openai" });
    const gpt35 = mk({ model: "gpt-3.5-turbo", provider: "openai" });
    const claude = mk({ model: "claude-3-opus", provider: "anthropic" });

    test("returns rows whose model exactly matches the search", () => {
        const result = filterRows([gpt4o, gpt35, claude], { search: "gpt-4o" });
        expect(result.map((r) => r.model)).toEqual(["gpt-4o"]);
    });

    test("matches partial substrings in model name", () => {
        const result = filterRows([gpt4o, gpt35, claude], { search: "gpt" });
        expect(result.map((r) => r.model)).toEqual(["gpt-4o", "gpt-3.5-turbo"]);
    });

    test("matches case-insensitively", () => {
        const result = filterRows([gpt4o, claude], { search: "CLAUDE" });
        expect(result.map((r) => r.model)).toEqual(["claude-3-opus"]);
    });

    test("matches against provider as well as model", () => {
        const result = filterRows([gpt4o, claude], { search: "anthropic" });
        expect(result.map((r) => r.provider)).toEqual(["anthropic"]);
    });

    test("trims surrounding whitespace from the query", () => {
        const result = filterRows([gpt4o, claude], { search: "   claude   " });
        expect(result.map((r) => r.model)).toEqual(["claude-3-opus"]);
    });

    test("returns an empty array when nothing matches", () => {
        const result = filterRows([gpt4o, claude], { search: "bedrock" });
        expect(result).toEqual([]);
    });

    test("empty search returns input unchanged (no-op)", () => {
        const input = [gpt4o, gpt35, claude];
        const result = filterRows(input, { search: "" });
        expect(result).toBe(input);
    });

    test("whitespace-only search returns input unchanged (no-op)", () => {
        const input = [gpt4o, gpt35, claude];
        const result = filterRows(input, { search: "   " });
        expect(result).toBe(input);
    });

    test("undefined search returns input unchanged (no-op)", () => {
        const input = [gpt4o, gpt35, claude];
        const result = filterRows(input, {});
        expect(result).toBe(input);
    });

    describe("source criterion", () => {
        const globalOpenai = mk({ source: "global", overrideId: null, provider: "openai" });
        const globalAnthropic = mk({
            source: "global",
            overrideId: null,
            provider: "anthropic",
            model: "claude-3-opus",
        });
        const overrideOpenai = mk({
            source: "override",
            overrideId: "ovr-1",
            provider: "openai",
        });
        const overrideAnthropic = mk({
            source: "override",
            overrideId: "ovr-2",
            provider: "anthropic",
            model: "claude-3-opus",
        });

        test("source 'all' returns input unchanged (no-op)", () => {
            const input = [globalOpenai, overrideOpenai];
            const result = filterRows(input, { source: "all" });
            expect(result).toBe(input);
        });

        test("source 'global' keeps only global rows", () => {
            const input = [globalOpenai, overrideOpenai, globalAnthropic];
            const result = filterRows(input, { source: "global" });
            expect(result.map((r) => r.source)).toEqual(["global", "global"]);
        });

        test("source 'override' keeps only override rows", () => {
            const input = [globalOpenai, overrideOpenai, overrideAnthropic];
            const result = filterRows(input, { source: "override" });
            expect(result.map((r) => r.overrideId)).toEqual(["ovr-1", "ovr-2"]);
        });

        test("source and search compose: both must match", () => {
            const input = [globalOpenai, overrideOpenai, overrideAnthropic, globalAnthropic];
            const result = filterRows(input, { source: "override", search: "anthropic" });
            expect(result.map((r) => r.overrideId)).toEqual(["ovr-2"]);
        });

        test("combined source+search with no matches yields empty array", () => {
            const input = [globalOpenai, globalAnthropic];
            const result = filterRows(input, { source: "override", search: "openai" });
            expect(result).toEqual([]);
        });

        test("undefined source behaves like 'all' (no-op when search also empty)", () => {
            const input = [globalOpenai, overrideOpenai];
            const result = filterRows(input, {});
            expect(result).toBe(input);
        });
    });

    describe("provider criterion", () => {
        const openaiRow = mk({ provider: "openai", model: "gpt-4o" });
        const anthropicRow = mk({ provider: "anthropic", model: "claude-3-opus" });
        const bedrockRow = mk({ provider: "bedrock", model: "titan-text" });

        test("provider 'all' returns input unchanged (no-op)", () => {
            const input = [openaiRow, anthropicRow];
            const result = filterRows(input, { provider: "all" });
            expect(result).toBe(input);
        });

        test("provider 'openai' keeps only openai rows", () => {
            const input = [openaiRow, anthropicRow, bedrockRow];
            const result = filterRows(input, { provider: "openai" });
            expect(result.map((r) => r.provider)).toEqual(["openai"]);
        });

        test("provider match is case-sensitive (providers come from data)", () => {
            const input = [openaiRow, anthropicRow];
            const result = filterRows(input, { provider: "OpenAI" });
            expect(result).toEqual([]);
        });

        test("provider and search compose: both must match", () => {
            const openaiClaude = mk({ provider: "openai", model: "claude-shim" });
            const input = [openaiRow, anthropicRow, openaiClaude];
            const result = filterRows(input, { provider: "openai", search: "claude" });
            expect(result.map((r) => r.model)).toEqual(["claude-shim"]);
        });

        test("provider and source compose: both must match", () => {
            const globalOpenai = mk({ source: "global", overrideId: null, provider: "openai" });
            const overrideOpenai = mk({
                source: "override",
                overrideId: "ovr-1",
                provider: "openai",
            });
            const overrideAnthropic = mk({
                source: "override",
                overrideId: "ovr-2",
                provider: "anthropic",
                model: "claude-3-opus",
            });
            const result = filterRows([globalOpenai, overrideOpenai, overrideAnthropic], {
                provider: "openai",
                source: "override",
            });
            expect(result.map((r) => r.overrideId)).toEqual(["ovr-1"]);
        });
    });

    describe("status criterion", () => {
        const now = new Date("2025-06-01T00:00:00Z").getTime();
        const active = mk({
            source: "override",
            overrideId: "ovr-active",
            effectiveFrom: "2024-01-01T00:00:00.000Z",
            effectiveTo: null,
        });
        const scheduled = mk({
            source: "override",
            overrideId: "ovr-scheduled",
            effectiveFrom: "2030-01-01T00:00:00.000Z",
            effectiveTo: null,
        });
        const expired = mk({
            source: "override",
            overrideId: "ovr-expired",
            effectiveFrom: "2023-01-01T00:00:00.000Z",
            effectiveTo: "2024-01-01T00:00:00.000Z",
        });

        test("undefined status returns all statuses untouched", () => {
            const input = [active, scheduled, expired];
            const result = filterRows(input, {}, now);
            expect(result).toBe(input);
        });

        test("status set { active } keeps only active rows", () => {
            const input = [active, scheduled, expired];
            const result = filterRows(input, { status: new Set<RowStatus>(["active"]) }, now);
            expect(result.map((r) => r.overrideId)).toEqual(["ovr-active"]);
        });

        test("status set { active, scheduled } keeps active and scheduled rows", () => {
            const input = [active, scheduled, expired];
            const result = filterRows(
                input,
                { status: new Set<RowStatus>(["active", "scheduled"]) },
                now,
            );
            expect(result.map((r) => r.overrideId)).toEqual(["ovr-active", "ovr-scheduled"]);
        });

        test("empty status set returns empty array (user explicitly excluded everything)", () => {
            const input = [active, scheduled, expired];
            const result = filterRows(input, { status: new Set<RowStatus>() }, now);
            expect(result).toEqual([]);
        });

        test("status composes with search", () => {
            const activeClaude = mk({
                source: "override",
                overrideId: "ovr-claude",
                provider: "anthropic",
                model: "claude-3-opus",
                effectiveFrom: "2024-01-01T00:00:00.000Z",
                effectiveTo: null,
            });
            const input = [active, activeClaude, expired];
            const result = filterRows(
                input,
                { status: new Set<RowStatus>(["active"]), search: "claude" },
                now,
            );
            expect(result.map((r) => r.overrideId)).toEqual(["ovr-claude"]);
        });

        test("status composes with source and provider", () => {
            const activeOverrideOpenai = mk({
                source: "override",
                overrideId: "ovr-1",
                provider: "openai",
                effectiveFrom: "2024-01-01T00:00:00.000Z",
                effectiveTo: null,
            });
            const activeGlobalOpenai = mk({
                source: "global",
                overrideId: null,
                provider: "openai",
                effectiveFrom: "2024-01-01T00:00:00.000Z",
                effectiveTo: null,
            });
            const activeOverrideAnthropic = mk({
                source: "override",
                overrideId: "ovr-2",
                provider: "anthropic",
                model: "claude-3-opus",
                effectiveFrom: "2024-01-01T00:00:00.000Z",
                effectiveTo: null,
            });
            const result = filterRows(
                [activeOverrideOpenai, activeGlobalOpenai, activeOverrideAnthropic, expired],
                {
                    status: new Set<RowStatus>(["active"]),
                    source: "override",
                    provider: "openai",
                },
                now,
            );
            expect(result.map((r) => r.overrideId)).toEqual(["ovr-1"]);
        });
    });
});

describe("parsePricingSearch", () => {
    const parse = (qs: string) => parsePricingSearch(new URLSearchParams(qs));

    test("empty params default to active-only status, all source, page 1", () => {
        const p = parse("");
        expect(p.search).toBe("");
        expect(p.source).toBe("all");
        expect(p.provider).toBe("all");
        expect(Array.from(p.status)).toEqual(["active"]);
        expect(p.page).toBe(1);
    });

    test("reads and trims search, reads provider and page", () => {
        const p = parse("pricing_q=%20gpt%20&pricing_provider=openai&pricing_page=3");
        expect(p.search).toBe("gpt");
        expect(p.provider).toBe("openai");
        expect(p.page).toBe(3);
    });

    test("parses comma-joined status and drops unknown tokens", () => {
        const p = parse("pricing_status=active,expired,bogus");
        expect(Array.from(p.status).sort()).toEqual(["active", "expired"]);
    });

    test("empty status param yields an empty set (explicitly nothing)", () => {
        const p = parse("pricing_status=");
        expect(Array.from(p.status)).toEqual([]);
    });

    test("only global/override are valid source values", () => {
        expect(parse("pricing_source=override").source).toBe("override");
        expect(parse("pricing_source=nonsense").source).toBe("all");
    });

    test("non-positive or non-numeric page falls back to 1", () => {
        expect(parse("pricing_page=0").page).toBe(1);
        expect(parse("pricing_page=-2").page).toBe(1);
        expect(parse("pricing_page=abc").page).toBe(1);
    });
});

describe("buildPricingPage", () => {
    const now = new Date("2025-06-01T00:00:00Z").getTime();
    const allActive = (n: number): PricingRowView[] =>
        Array.from({ length: n }, (_, i) =>
            mkRow({
                source: "override",
                overrideId: `ovr-${i}`,
                model: `m-${String(i).padStart(3, "0")}`,
                effectiveFrom: "2024-01-01T00:00:00.000Z",
                effectiveTo: null,
            }),
        );

    test("counts are grand totals, independent of filters", () => {
        const rows = [globalRow, overrideRow];
        const page = buildPricingPage(rows, parsePricingSearch(new URLSearchParams()), now);
        expect(page.counts).toEqual({ global: 1, override: 1, total: 2 });
    });

    test("providers are the distinct sorted set across all rows", () => {
        const rows = [
            mkRow({ provider: "openai", overrideId: null }),
            mkRow({ provider: "anthropic", overrideId: null, model: "claude" }),
            mkRow({ provider: "openai", overrideId: null, model: "gpt-4" }),
        ];
        const page = buildPricingPage(rows, parsePricingSearch(new URLSearchParams()), now);
        expect(page.providers).toEqual(["anthropic", "openai"]);
    });

    test("defaults to 100 rows per page and reports pageCount", () => {
        const page = buildPricingPage(
            allActive(150),
            parsePricingSearch(new URLSearchParams()),
            now,
        );
        expect(page.rows).toHaveLength(DEFAULT_PRICING_PAGE_SIZE);
        expect(page.total).toBe(150);
        expect(page.page).toBe(1);
        expect(page.pageCount).toBe(2);
    });

    test("second page returns the remainder", () => {
        const page = buildPricingPage(
            allActive(150),
            parsePricingSearch(new URLSearchParams("pricing_page=2")),
            now,
        );
        expect(page.rows).toHaveLength(50);
        expect(page.page).toBe(2);
    });

    test("page beyond the end clamps to the last page", () => {
        const page = buildPricingPage(
            allActive(150),
            parsePricingSearch(new URLSearchParams("pricing_page=99")),
            now,
        );
        expect(page.page).toBe(2);
        expect(page.rows).toHaveLength(50);
    });

    test("total reflects the filtered set, not the grand total", () => {
        const rows = [
            mkRow({ provider: "openai", overrideId: null, model: "gpt-4o" }),
            mkRow({ provider: "anthropic", overrideId: null, model: "claude" }),
        ];
        const page = buildPricingPage(
            rows,
            parsePricingSearch(new URLSearchParams("pricing_provider=openai")),
            now,
        );
        expect(page.total).toBe(1);
        expect(page.counts.total).toBe(2);
        expect(page.rows.map((r) => r.provider)).toEqual(["openai"]);
    });

    test("respects an explicit page size", () => {
        const page = buildPricingPage(
            allActive(10),
            parsePricingSearch(new URLSearchParams()),
            now,
            4,
        );
        expect(page.rows).toHaveLength(4);
        expect(page.pageCount).toBe(3);
    });
});

describe("pageWindow", () => {
    test("returns every page when there are 7 or fewer", () => {
        expect(pageWindow(1, 1)).toEqual([1]);
        expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    test("truncates the tail near the start", () => {
        expect(pageWindow(2, 20)).toEqual([1, 2, 3, "ellipsis", 20]);
    });

    test("truncates both ends in the middle", () => {
        expect(pageWindow(10, 20)).toEqual([1, "ellipsis", 9, 10, 11, "ellipsis", 20]);
    });

    test("truncates the head near the end", () => {
        expect(pageWindow(19, 20)).toEqual([1, "ellipsis", 18, 19, 20]);
    });
});
