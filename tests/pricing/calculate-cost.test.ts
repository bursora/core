/**
 * Tests for the calculateCost deep module.
 *
 * `calculateCost(usage, pricingRow)` is pure: no DB, no network, no clock. It
 * computes the USD cost for a single usage event given a fully-resolved
 * pricing row. The caller is responsible for selecting the right pricing row
 * (by provider/model/region/ts).
 *
 * Inputs:
 *   - Usage = { promptTokens, completionTokens, cacheTokens?, cacheWriteTokens? }
 *   - PricingRow (non-null; a null row throws `UnknownPricingError`)
 *
 * Output:
 *   - Money (USD as a fixed-precision decimal string with up to 8 fractional
 *     digits — matches the `numeric(14,8)` column).
 *
 * Documented policy:
 *   - When pricingRow is null (missing rate), throw `UnknownPricingError`. The
 *     ingest path catches it per event and reports the unpriced (provider,
 *     model) pair so unknown models surface to the customer instead of
 *     silently billing 0; priced events in the same batch still persist.
 *   - When token counts are zero on a side, that side contributes zero.
 *   - Cache reads price at cachePer1mUsd; cache writes (cacheWriteTokens, a
 *     subset of cacheTokens) price at the input rate times 1.25. When
 *     cachePer1mUsd is null the read side contributes zero, but writes still
 *     bill off the input rate.
 */

import { calculateCost, UnknownPricingError } from "@/lib/metering/pricing/calculate-cost";
import type { PricingRow } from "@/lib/metering/pricing/pricing-row";
import Big from "big.js";
import { describe, expect, test } from "bun:test";

const baseRow = (overrides: Partial<PricingRow> = {}): PricingRow => ({
    id: "row-1",
    workspaceId: null,
    provider: "openai",
    model: "gpt-4o",
    region: "global",
    inputPer1mUsd: "2.5",
    outputPer1mUsd: "10",
    cachePer1mUsd: "1.25",
    effectiveFrom: new Date("2024-01-01T00:00:00Z"),
    effectiveTo: null,
    ...overrides,
});

interface Case {
    readonly name: string;
    readonly usage: {
        readonly promptTokens: number;
        readonly completionTokens: number;
        readonly cacheTokens?: number;
        readonly cacheWriteTokens?: number;
        readonly cacheWrite1hTokens?: number;
    };
    readonly row: PricingRow;
    readonly expected: string;
}

const cases: readonly Case[] = [
    {
        name: "input-only: 1000 prompt @ $2.5/1M = 0.00250000",
        usage: { promptTokens: 1000, completionTokens: 0 },
        row: baseRow(),
        expected: "0.00250000",
    },
    {
        name: "output-only: 1000 completion @ $10/1M = 0.01000000",
        usage: { promptTokens: 0, completionTokens: 1000 },
        row: baseRow(),
        expected: "0.01000000",
    },
    {
        name: "cache-hit: 1000 cache @ $1.25/1M = 0.00125000",
        usage: { promptTokens: 0, completionTokens: 0, cacheTokens: 1000 },
        row: baseRow(),
        expected: "0.00125000",
    },
    {
        name: "mixed call: 500 prompt + 250 completion + 100 cache",
        // 500 * 2.5 / 1_000_000 = 0.00125
        // 250 * 10  / 1_000_000 = 0.00250
        // 100 * 1.25 / 1_000_000 = 0.000125
        // total = 0.003875
        usage: { promptTokens: 500, completionTokens: 250, cacheTokens: 100 },
        row: baseRow(),
        expected: "0.00387500",
    },
    {
        name: "zero tokens across the board → 0",
        usage: { promptTokens: 0, completionTokens: 0, cacheTokens: 0 },
        row: baseRow(),
        expected: "0.00000000",
    },
    {
        name: "expired pricing row uses its rate (caller picks the right row)",
        // calculateCost is pure: it uses whatever row it's given. The caller
        // resolves the right one. Here we pass an expired row and confirm it
        // applies its rate without checking effectiveTo.
        usage: { promptTokens: 1000, completionTokens: 0 },
        row: baseRow({
            inputPer1mUsd: "5",
            effectiveFrom: new Date("2023-01-01T00:00:00Z"),
            effectiveTo: new Date("2023-06-01T00:00:00Z"),
        }),
        expected: "0.00500000",
    },
    {
        name: "cache tokens with null cachePer1mUsd → cache READ side contributes 0",
        // 100 prompt @ 2.5/1M = 0.00025; 100 cache reads @ null = 0
        usage: { promptTokens: 100, completionTokens: 0, cacheTokens: 100 },
        row: baseRow({ cachePer1mUsd: null }),
        expected: "0.00025000",
    },
    {
        name: "cache write/read split: writes bill at input * 1.25, reads at cache rate",
        // cacheTokens 1000 = 400 writes + 600 reads.
        // reads:  600 * 1.25 / 1M           = 0.00075
        // writes: 400 * (2.5 * 1.25=3.125)/1M = 0.00125
        // total = 0.00200000
        usage: { promptTokens: 0, completionTokens: 0, cacheTokens: 1000, cacheWriteTokens: 400 },
        row: baseRow(),
        expected: "0.00200000",
    },
    {
        name: "cache writes bill off input rate even when cachePer1mUsd is null",
        // 1000 writes * (2.5 * 1.25=3.125) / 1M = 0.003125 → 0.00312500
        usage: { promptTokens: 0, completionTokens: 0, cacheTokens: 1000, cacheWriteTokens: 1000 },
        row: baseRow({ cachePer1mUsd: null }),
        expected: "0.00312500",
    },
    {
        name: "anthropic 5-min cache write priced at 1.25x (regression for the 12x undercount)",
        // claude-ish rates: input 3, cache read 0.3. cacheTokens 2000 = 1000 writes + 1000 reads.
        // reads:  1000 * 0.3 / 1M            = 0.0003
        // writes: 1000 * (3 * 1.25=3.75) / 1M = 0.00375
        // total = 0.00405000  (the old single-rate path billed 2000 * 0.3 = 0.0006)
        usage: { promptTokens: 0, completionTokens: 0, cacheTokens: 2000, cacheWriteTokens: 1000 },
        row: baseRow({
            provider: "anthropic",
            model: "claude-sonnet-4",
            inputPer1mUsd: "3",
            outputPer1mUsd: "15",
            cachePer1mUsd: "0.3",
        }),
        expected: "0.00405000",
    },
    {
        name: "anthropic 1-hour cache write priced at 2x, 5-minute remainder at 1.25x",
        // claude-ish rates: input 3, cache read 0.3. cacheTokens 3000 = 2000 writes
        // (600 of them 1-hour TTL) + 1000 reads.
        // reads:       1000 * 0.3 / 1M           = 0.0003
        // 5m writes:   1400 * (3 * 1.25=3.75) / 1M = 0.00525
        // 1h writes:    600 * (3 * 2=6) / 1M      = 0.0036
        // total = 0.00915000
        usage: {
            promptTokens: 0,
            completionTokens: 0,
            cacheTokens: 3000,
            cacheWriteTokens: 2000,
            cacheWrite1hTokens: 600,
        },
        row: baseRow({
            provider: "anthropic",
            model: "claude-sonnet-4",
            inputPer1mUsd: "3",
            outputPer1mUsd: "15",
            cachePer1mUsd: "0.3",
        }),
        expected: "0.00915000",
    },
    {
        name: "all writes 1-hour TTL bill entirely at 2x",
        // 1000 writes, all 1-hour. 1000 * (2.5 * 2=5) / 1M = 0.005
        usage: {
            promptTokens: 0,
            completionTokens: 0,
            cacheTokens: 1000,
            cacheWriteTokens: 1000,
            cacheWrite1hTokens: 1000,
        },
        row: baseRow(),
        expected: "0.00500000",
    },
    {
        name: "malformed cacheWrite1hTokens > cacheWriteTokens clamps to all-1h",
        // 400 writes, 1h reported as 999 (malformed). Clamp 1h to 400; 0 left at 1.25x.
        // 400 * (2.5 * 2=5) / 1M = 0.002
        usage: {
            promptTokens: 0,
            completionTokens: 0,
            cacheTokens: 400,
            cacheWriteTokens: 400,
            cacheWrite1hTokens: 999,
        },
        row: baseRow(),
        expected: "0.00200000",
    },
    {
        name: "undefined cacheTokens treated as 0",
        usage: { promptTokens: 1000, completionTokens: 0 },
        row: baseRow(),
        expected: "0.00250000",
    },
    {
        name: "high-precision rate with sub-cent tokens",
        // 1 prompt token * 2.5 / 1_000_000 = 0.0000025 → 0.00000250
        usage: { promptTokens: 1, completionTokens: 0 },
        row: baseRow(),
        expected: "0.00000250",
    },
    {
        // Pins the embeddings contract: a pricing row with outputPer1mUsd = "0"
        // priced against usage with completionTokens = 0 must return the input
        // rate cost only. Guards against a future refactor accidentally doing
        // something like `(completion / outputRate)` and blowing up on zero.
        name: "zero output rate + zero completion tokens → input-only cost",
        // 1000 prompt * 20 / 1_000_000 = 0.02
        usage: { promptTokens: 1000, completionTokens: 0 },
        row: baseRow({
            model: "text-embedding-3-small",
            inputPer1mUsd: "20",
            outputPer1mUsd: "0",
            cachePer1mUsd: null,
        }),
        expected: "0.02000000",
    },
];

describe("calculateCost", () => {
    for (const c of cases) {
        test(c.name, () => {
            const cost = calculateCost(c.usage, c.row);
            expect(cost.usd).toBe(c.expected);
        });
    }

    test("returned cost is a Money object with usd string field", () => {
        const cost = calculateCost({ promptTokens: 1000, completionTokens: 0 }, baseRow());
        expect(typeof cost.usd).toBe("string");
    });

    test("null pricing row → throws UnknownPricingError", () => {
        // The ingest path catches it and reports the unpriced (provider, model)
        // pair so unknown models surface to the customer instead of silently
        // billing 0; priced events in the same batch still persist.
        expect(() => calculateCost({ promptTokens: 100, completionTokens: 50 }, null)).toThrowError(
            UnknownPricingError,
        );
    });

    test("does not mutate inputs", () => {
        const usage = { promptTokens: 100, completionTokens: 100 };
        const row = baseRow();
        const frozenUsage = Object.freeze({ ...usage });
        const frozenRow = Object.freeze({ ...row });
        expect(() => calculateCost(frozenUsage, frozenRow)).not.toThrow();
    });

    // Pins cache-hit billing: cache-tokens use cachePer1mUsd; the remaining
    // promptTokens (already net of the cache hit, per the SDK extractor) pay
    // the full input rate.
    test("deepseek-chat cache-hit: 56 miss + 1152 hit + 1 output", () => {
        const row = baseRow({
            provider: "deepseek",
            model: "deepseek-chat",
            inputPer1mUsd: "0.14",
            outputPer1mUsd: "0.28",
            cachePer1mUsd: "0.0028",
        });

        // (56 * 0.14 + 1152 * 0.0028 + 1 * 0.28) / 1_000_000
        // = (7.84 + 3.2256 + 0.28) / 1_000_000
        // = 11.3456 / 1_000_000
        // = 0.0000113456 → toFixed(8) = "0.00001135"
        const cost = calculateCost(
            { promptTokens: 56, completionTokens: 1, cacheTokens: 1152 },
            row,
        );

        expect(cost.usd).toBe("0.00001135");
    });
});

describe("calculateCost precision (#911)", () => {
    /**
     * The IEEE 754 float path that calculateCost used before #911 was fixed
     * shifts the intermediate product/sum off the exact decimal value by ULPs
     * that can propagate into the 8-digit `numeric(14,8)` output column. Big-
     * based arithmetic computes the exact decimal product/quotient. These
     * tests pin the new behaviour: typical invoices unchanged at 8 digits,
     * edge-case inputs no longer drift.
     */

    test("exact: 3 tokens at $0.005/1M = 0.00000002 (float drifts to 0.00000001)", () => {
        // True value: 3 * 0.005 / 1_000_000 = 1.5e-8.
        // toFixed(8) half-up → "0.00000002".
        // Float path: 3 * 0.005 = 0.015 represented as 0.014999999999999999... ;
        // /1e6 = 1.499...e-8 → toFixed(8) → "0.00000001".
        const row = baseRow({
            inputPer1mUsd: "0.005",
            outputPer1mUsd: "0",
            cachePer1mUsd: null,
        });
        const cost = calculateCost({ promptTokens: 3, completionTokens: 0 }, row);
        expect(cost.usd).toBe("0.00000002");
    });

    test("exact: 100 tokens at $0.00125/1M = 0.00000013 (float drifts to 0.00000012)", () => {
        // True value: 100 * 0.00125 / 1e6 = 1.25e-7 → toFixed(8) = "0.00000013".
        // Float path lands just below the half-up boundary.
        const row = baseRow({
            inputPer1mUsd: "0.00125",
            outputPer1mUsd: "0",
            cachePer1mUsd: null,
        });
        const cost = calculateCost({ promptTokens: 100, completionTokens: 0 }, row);
        expect(cost.usd).toBe("0.00000013");
    });

    test("exact: 999_999_999_999 tokens at $0.005/1M = 5000.00000000 (float drifts down by a cent)", () => {
        // True value: 999_999_999_999 * 0.005 / 1e6 = 4999.999999995
        // → toFixed(8) half-up = "5000.00000000" (Big agrees on exact decimal).
        // Float path: 4999.999999994999... → toFixed(8) = "4999.99999999".
        const row = baseRow({
            inputPer1mUsd: "0.005",
            outputPer1mUsd: "0",
            cachePer1mUsd: null,
        });
        const cost = calculateCost({ promptTokens: 999_999_999_999, completionTokens: 0 }, row);
        expect(cost.usd).toBe("5000.00000000");
    });

    test("scoped DP: a lowered global Big.DP cannot truncate the intermediate division", () => {
        // If another module lowers the GLOBAL Big.DP below ~8, an unscoped
        // `div` would truncate before the final round-to-8 and undercharge.
        // The cost math runs on a dedicated Big constructor with a pinned DP,
        // so the global mutation is ignored and the result stays exact.
        const originalDp = Big.DP;
        Big.DP = 2;
        try {
            // 3 * 0.005 / 1_000_000 = 1.5e-8 → toFixed(8) half-up = "0.00000002".
            // With a truncating global DP=2 the quotient would collapse to 0.
            const cost = calculateCost(
                { promptTokens: 3, completionTokens: 0 },
                baseRow({ inputPer1mUsd: "0.005", outputPer1mUsd: "0", cachePer1mUsd: null }),
            );
            expect(cost.usd).toBe("0.00000002");
        } finally {
            Big.DP = originalDp;
        }
    });

    test("invariance: typical invoice inputs match the float-based formula at 8 fractional digits", () => {
        // Customer-facing invariant: the fix MUST NOT shift invoices for the
        // realistic (rate, tokens) shape used by actual provider rates. Drift-
        // sensitive rates (the test cases above) are intentionally excluded
        // — those are the cases where Big now produces the correct value.
        const tokenSweep = [1, 7, 42, 1_000, 9_999, 123_456, 1_000_000, 7_654_321];
        const rateSweep = ["0.0028", "0.14", "0.28", "2.5", "10", "75.123456"];

        for (const promptTokens of tokenSweep) {
            for (const rate of rateSweep) {
                const expected = ((promptTokens * Number.parseFloat(rate)) / 1_000_000).toFixed(8);
                const actual = calculateCost(
                    { promptTokens, completionTokens: 0 },
                    baseRow({ inputPer1mUsd: rate, outputPer1mUsd: "0", cachePer1mUsd: null }),
                ).usd;
                expect(actual).toBe(expected);
            }
        }
    });
});
