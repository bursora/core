/**
 * Tests for the shared number-formatting helpers.
 *
 * These wrap Intl.NumberFormat so the dashboard renders consistent
 * USD amounts, compact token counts, and percent deviations across
 * locales while accepting both numeric and string (drizzle numeric)
 * input.
 */

import {
    formatAvgCostPerCall,
    formatCostPerCall,
    formatCount,
    formatDashboardPercent,
    formatDashboardUsd,
    formatPercent,
    formatPreciseUsd,
    formatRelativeTime,
    formatSignedPercent,
    formatTokens,
    formatUsd,
    formatWholePercent,
    formatWholeUsd,
} from "@/lib/format";
import { describe, expect, test } from "bun:test";

describe("formatRelativeTime", () => {
    const now = new Date("2026-06-02T13:59:39Z").getTime();
    const ago = (ms: number) => formatRelativeTime(new Date(now - ms), now);

    test("renders past and future in the right direction", () => {
        expect(ago(30_000)).toBe("30 seconds ago");
        expect(formatRelativeTime(new Date(now + 90_000), now)).toBe("in 2 minutes");
    });

    test("treats sub-threshold deltas as 'just now'", () => {
        expect(ago(2_000)).toBe("just now");
    });

    test("rolls a near-full unit up instead of showing its ceiling", () => {
        // The boundary bug: 59.6 of a unit rounds to 60/24 and must carry over.
        expect(ago(59.6 * 1_000)).toBe("1 minute ago");
        expect(ago(59.6 * 60_000)).toBe("1 hour ago");
        expect(ago(23.6 * 3_600_000)).toBe("yesterday");
    });
});

describe("formatUsd", () => {
    test("formats positive numbers with two fractional digits", () => {
        expect(formatUsd(12.5, "en-US")).toBe("$12.50");
    });

    test("accepts string input from drizzle numeric columns", () => {
        expect(formatUsd("42.1", "en-US")).toBe("$42.10");
    });

    test("preserves up to six fractional digits for sub-cent positive amounts", () => {
        expect(formatUsd(0.000123, "en-US")).toBe("$0.000123");
    });

    test("keeps two fractional digits for amounts at or above one cent", () => {
        expect(formatUsd(0.01, "en-US")).toBe("$0.01");
    });
});

describe("formatPreciseUsd", () => {
    test("preserves up to six fractional digits for tiny amounts", () => {
        expect(formatPreciseUsd(0.000123, "en-US")).toBe("$0.000123");
    });

    test("still uses two minimum fractional digits for round amounts", () => {
        expect(formatPreciseUsd(12.5, "en-US")).toBe("$12.50");
    });

    test("falls back to $0.00 for non-finite input", () => {
        expect(formatPreciseUsd(Number.NaN, "en-US")).toBe("$0.00");
    });

    test("renders zero as $0.00", () => {
        expect(formatUsd(0, "en-US")).toBe("$0.00");
    });

    test("falls back to $0.00 for NaN and non-finite input", () => {
        expect(formatUsd(Number.NaN, "en-US")).toBe("$0.00");
        expect(formatUsd("not-a-number", "en-US")).toBe("$0.00");
        expect(formatUsd(Number.POSITIVE_INFINITY, "en-US")).toBe("$0.00");
    });

    test("handles negative amounts", () => {
        expect(formatUsd(-3.5, "en-US")).toBe("-$3.50");
    });

    test("groups very large amounts", () => {
        expect(formatUsd(1234567.89, "en-US")).toBe("$1,234,567.89");
    });

    test("respects locale grouping", () => {
        // de-DE uses dot as thousands separator, comma as decimal.
        const out = formatUsd(1234.5, "de-DE");
        expect(out).toContain("1.234,50");
    });
});

describe("formatTokens", () => {
    test("uses compact notation for thousands", () => {
        expect(formatTokens(1200, "en-US")).toBe("1.2K");
    });

    test("uses compact notation for millions", () => {
        expect(formatTokens(3_400_000, "en-US")).toBe("3.4M");
    });

    test("renders small counts as plain integers", () => {
        expect(formatTokens(42, "en-US")).toBe("42");
    });

    test("falls back to 0 for non-finite", () => {
        expect(formatTokens(Number.NaN, "en-US")).toBe("0");
    });
});

describe("formatCount", () => {
    test("formats integers with locale grouping", () => {
        expect(formatCount(1234567, "en-US")).toBe("1,234,567");
    });

    test("renders small integers unchanged", () => {
        expect(formatCount(42, "en-US")).toBe("42");
    });

    test("renders zero as 0", () => {
        expect(formatCount(0, "en-US")).toBe("0");
    });
});

describe("formatAvgCostPerCall", () => {
    test("returns null when totalCalls is zero", () => {
        expect(formatAvgCostPerCall("1.50000000", 0, "en-US")).toBeNull();
    });

    test("returns formatted USD for a normal case", () => {
        // 1.00 / 4 = 0.25
        expect(formatAvgCostPerCall("1.00000000", 4, "en-US")).toBe("$0.25");
    });

    test("preserves precision for very small per-call values", () => {
        // 0.001 / 1000 = 0.000001
        expect(formatAvgCostPerCall("0.00100000", 1000, "en-US")).toBe("$0.000001");
    });

    test("groups very large per-call values", () => {
        // 1,000,000 / 1 = 1,000,000
        expect(formatAvgCostPerCall("1000000.00000000", 1, "en-US")).toBe("$1,000,000.00");
    });
});

describe("formatCostPerCall", () => {
    test("returns null when callCount is zero", () => {
        expect(formatCostPerCall("0.50000000", 0, "en-US")).toBeNull();
    });

    test("returns formatted USD for a normal case", () => {
        // 0.50 / 5 = 0.10
        expect(formatCostPerCall("0.50000000", 5, "en-US")).toBe("$0.10");
    });

    test("preserves precision for tiny per-call values", () => {
        expect(formatCostPerCall("0.00010000", 100, "en-US")).toBe("$0.000001");
    });

    test("groups very large per-call values", () => {
        expect(formatCostPerCall("9999999.00000000", 1, "en-US")).toBe("$9,999,999.00");
    });
});

describe("formatPercent", () => {
    test("formats fractional ratio with one decimal", () => {
        // 0.123 → 12.3%
        expect(formatPercent(0.123, "en-US")).toBe("12.3%");
    });

    test("renders zero as 0.0%", () => {
        expect(formatPercent(0, "en-US")).toBe("0.0%");
    });

    test("handles negatives", () => {
        expect(formatPercent(-0.05, "en-US")).toBe("-5.0%");
    });

    test("falls back to 0.0% for non-finite", () => {
        expect(formatPercent(Number.NaN, "en-US")).toBe("0.0%");
    });
});

describe("formatWholePercent", () => {
    test("rounds to a whole percentage", () => {
        expect(formatWholePercent(0.126)).toMatch(/13%/);
    });

    test("renders zero as 0%", () => {
        expect(formatWholePercent(0)).toMatch(/0%/);
    });

    test("falls back to 0% for NaN", () => {
        expect(formatWholePercent(Number.NaN)).toMatch(/0%/);
    });
});

describe("formatWholeUsd", () => {
    test("drops fractional digits for clean dashboard numbers", () => {
        expect(formatWholeUsd(1234.56)).toMatch(/\$1,235/);
    });

    test("renders zero as $0", () => {
        expect(formatWholeUsd(0)).toMatch(/\$0/);
    });

    test("falls back to $0 for non-finite input", () => {
        expect(formatWholeUsd(Number.POSITIVE_INFINITY)).toMatch(/\$0/);
    });
});

describe("formatDashboardUsd", () => {
    test("renders zero as $0", () => {
        expect(formatDashboardUsd(0)).toMatch(/\$0/);
    });

    test("preserves sub-cent precision for tiny positive values", () => {
        expect(formatDashboardUsd(0.003)).toBe("$0.003");
    });

    test("keeps cents for sub-$100 values", () => {
        expect(formatDashboardUsd(0.81)).toMatch(/\$0\.81/);
        expect(formatDashboardUsd(12.5)).toMatch(/\$12\.50/);
    });

    test("drops cents for $100+ values", () => {
        expect(formatDashboardUsd(1847.2)).toMatch(/\$1,847/);
        expect(formatDashboardUsd(1847.2)).not.toMatch(/\.20/);
    });

    test("falls back to $0 for non-finite input", () => {
        expect(formatDashboardUsd(Number.NaN)).toMatch(/\$0/);
    });
});

describe("formatDashboardPercent", () => {
    test("renders zero as 0%", () => {
        expect(formatDashboardPercent(0)).toMatch(/0%/);
    });

    test("renders sub-1% positive ratio as <1%", () => {
        expect(formatDashboardPercent(0.0081)).toBe("<1%");
    });

    test("rounds 1%+ ratios to whole percent", () => {
        expect(formatDashboardPercent(0.84)).toMatch(/84%/);
    });

    test("falls back to 0% for non-finite input", () => {
        expect(formatDashboardPercent(Number.NaN)).toMatch(/0%/);
    });
});

describe("formatSignedPercent", () => {
    test("prepends + for positive deltas", () => {
        expect(formatSignedPercent(0.05)).toMatch(/^\+5%/);
    });

    test("keeps locale minus for negative deltas (no double sign)", () => {
        const out = formatSignedPercent(-0.05);
        expect(out).not.toMatch(/^\+/);
        expect(out).toMatch(/5%/);
    });

    test("renders zero as 0% (no sign prefix)", () => {
        expect(formatSignedPercent(0)).toMatch(/^0%/);
    });
});
