/**
 * Tests for the calculateCost deep module.
 *
 * `calculateCost(usage, pricingRow)` is pure: no DB, no network, no clock. It
 * computes the USD cost for a single usage event given a fully-resolved
 * pricing row. The caller is responsible for selecting the right pricing row
 * (by provider/model/region/ts).
 *
 * Inputs:
 *   - Usage = { promptTokens, completionTokens, cacheTokens? }
 *   - PricingRow | null
 *
 * Output:
 *   - Money (USD as a fixed-precision decimal string with up to 8 fractional
 *     digits — matches the `numeric(14,8)` column).
 *
 * Documented policy:
 *   - When pricingRow is null (missing rate), return Money("0"). No throw.
 *   - When token counts are zero on a side, that side contributes zero.
 *   - When cacheTokens is set but cachePer1mUsd is null, cache contributes zero.
 */

import { calculateCost } from "@/lib/metering/pricing/calculate-cost";
import type { PricingRow } from "@/lib/metering/pricing/pricing-row";
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
    };
    readonly row: PricingRow | null;
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
        name: "missing pricing row (null) → 0 (documented fallback)",
        usage: { promptTokens: 9999, completionTokens: 9999, cacheTokens: 9999 },
        row: null,
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
        name: "cache tokens with null cachePer1mUsd → cache side contributes 0",
        // 100 prompt @ 2.5/1M = 0.00025; 100 cache @ null = 0
        usage: { promptTokens: 100, completionTokens: 0, cacheTokens: 100 },
        row: baseRow({ cachePer1mUsd: null }),
        expected: "0.00025000",
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
