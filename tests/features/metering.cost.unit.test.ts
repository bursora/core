/**
 * Pure unit tests for `calculateCost` exposed by `@/lib/metering`.
 *
 * Table-driven over provider × model × region × (with/without cache) so the
 * deep module's contract is locked at the feature boundary.
 */

import { calculateCost } from "@/lib/metering";
import type { PricingRow } from "@/lib/metering/pricing";
import { describe, expect, test } from "bun:test";

const row = (overrides: Partial<PricingRow> = {}): PricingRow => ({
    id: "11111111-1111-1111-1111-111111111111",
    workspaceId: null,
    provider: "openai",
    model: "gpt-4o",
    region: "global",
    inputPer1mUsd: "5",
    outputPer1mUsd: "15",
    cachePer1mUsd: null,
    effectiveFrom: new Date("2024-01-01T00:00:00Z"),
    effectiveTo: null,
    ...overrides,
});

interface Case {
    readonly name: string;
    readonly usage: { promptTokens: number; completionTokens: number; cacheTokens?: number };
    readonly row: PricingRow | null;
    readonly expected: string;
}

const cases: readonly Case[] = [
    {
        name: "null pricing row → zero",
        usage: { promptTokens: 1000, completionTokens: 500 },
        row: null,
        expected: "0.00000000",
    },
    {
        name: "openai / gpt-4o / global, no cache",
        usage: { promptTokens: 1000, completionTokens: 1000 },
        row: row(),
        expected: "0.02000000",
    },
    {
        name: "anthropic / claude / global, with cache tier",
        usage: { promptTokens: 2000, completionTokens: 1000, cacheTokens: 4000 },
        row: row({
            provider: "anthropic",
            model: "claude-3-opus",
            inputPer1mUsd: "15",
            outputPer1mUsd: "75",
            cachePer1mUsd: "1.5",
        }),
        expected: "0.11100000",
    },
    {
        name: "google / gemini / eu, cache tokens present but row has null cache rate",
        usage: { promptTokens: 1500, completionTokens: 500, cacheTokens: 9999 },
        row: row({
            provider: "google",
            model: "gemini-pro",
            region: "eu",
            inputPer1mUsd: "0.6",
            outputPer1mUsd: "0.6",
            cachePer1mUsd: null,
        }),
        expected: "0.00120000",
    },
    {
        name: "negative tokens clamp to zero",
        usage: { promptTokens: -50, completionTokens: -10 },
        row: row(),
        expected: "0.00000000",
    },
];

describe("@/lib/metering calculateCost", () => {
    for (const c of cases) {
        test(c.name, () => {
            const result = calculateCost(c.usage, c.row);
            expect(result.usd).toBe(c.expected);
        });
    }
});
