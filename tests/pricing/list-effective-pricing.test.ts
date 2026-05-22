/**
 * Tests for the listEffectivePricing use case.
 *
 * Returns one entry per (provider, model, region) currently in effect for a
 * workspace — the row the metering lookup would resolve at `now`. Workspace
 * overrides shadow global rows for matching tuples.
 *
 * Behavior under test:
 *   1. Globals only — every active global row appears, tagged `source: 'global'`.
 *   2. Override shadows a matching global at the same tuple.
 *   3. Standalone override (no global counterpart) appears.
 *   4. Multiple regions for the same model yield distinct entries.
 *   5. Expired override (effectiveTo before now) falls back to the global row.
 *   6. Workspace isolation — other workspaces' overrides never appear.
 *   7. Results sorted by (provider, model, region) ascending.
 *   8. Grouping key handles tuples whose space-joined keys would collide
 *      (e.g. model "foo bar" region "global" vs model "foo" region "bar global").
 */

import { listEffectivePricing } from "@/lib/metering/pricing/list-effective-pricing.usecase";
import type {
    NewPricingRow,
    PricingRepository,
    PricingRow,
} from "@/lib/metering/pricing/pricing-row";
import { describe, expect, test } from "bun:test";

const row = (overrides: Partial<PricingRow> = {}): PricingRow => ({
    id: "row-1",
    workspaceId: null,
    provider: "openai",
    model: "gpt-4o",
    region: "global",
    inputPer1mUsd: "0.0025",
    outputPer1mUsd: "0.01",
    cachePer1mUsd: "0.00125",
    effectiveFrom: new Date("2024-01-01T00:00:00Z"),
    effectiveTo: null,
    ...overrides,
});

const makeRepo = (initial: PricingRow[]): PricingRepository => {
    const rows = [...initial];
    return {
        findLatestGlobal: async () => null,
        closeAndInsert: async () => {},
        insert: async (_row: NewPricingRow) => {},
        findCandidatesForLookup: async (input) =>
            rows.filter(
                (r) =>
                    r.provider === input.provider &&
                    r.model === input.model &&
                    r.region === input.region &&
                    (r.workspaceId === null || r.workspaceId === input.workspaceId),
            ),
        findAllCandidatesForWorkspace: async (workspaceId) =>
            rows.filter((r) => r.workspaceId === null || r.workspaceId === workspaceId),
        insertOverride: async () => {
            throw new Error("not used");
        },
        listOverridesByWorkspace: async (workspaceId) =>
            rows.filter((r) => r.workspaceId === workspaceId),
        deleteOverride: async () => false,
        updateOverride: async () => null,
    };
};

const now = new Date("2025-06-01T00:00:00Z");

describe("listEffectivePricing", () => {
    test("returns every active global tagged as 'global' when no overrides exist", async () => {
        const repo = makeRepo([
            row({
                id: "g-openai",
                provider: "openai",
                model: "gpt-4o",
                region: "global",
            }),
            row({
                id: "g-anthropic",
                provider: "anthropic",
                model: "claude-3-5-sonnet",
                region: "global",
            }),
        ]);

        const result = await listEffectivePricing({
            pricing: repo,
            workspaceId: "ws-1",
            now,
        });

        expect(result.length).toBe(2);
        expect(result.every((entry) => entry.source === "global")).toBe(true);
        expect(result.every((entry) => entry.overrideId === null)).toBe(true);
    });

    test("override shadows a matching global at the same tuple", async () => {
        const repo = makeRepo([
            row({
                id: "g-1",
                provider: "openai",
                model: "gpt-4o",
                region: "global",
                inputPer1mUsd: "0.0025",
            }),
            row({
                id: "o-1",
                workspaceId: "ws-1",
                provider: "openai",
                model: "gpt-4o",
                region: "global",
                inputPer1mUsd: "0.0010",
                effectiveFrom: new Date("2025-01-01T00:00:00Z"),
            }),
        ]);

        const result = await listEffectivePricing({
            pricing: repo,
            workspaceId: "ws-1",
            now,
        });

        expect(result.length).toBe(1);
        expect(result[0]?.source).toBe("override");
        expect(result[0]?.overrideId).toBe("o-1");
        expect(result[0]?.inputPer1mUsd).toBe("0.0010");
    });

    test("standalone override with no global counterpart still appears", async () => {
        const repo = makeRepo([
            row({
                id: "o-only",
                workspaceId: "ws-1",
                provider: "openai",
                model: "gpt-custom",
                region: "global",
            }),
        ]);

        const result = await listEffectivePricing({
            pricing: repo,
            workspaceId: "ws-1",
            now,
        });

        expect(result.length).toBe(1);
        expect(result[0]?.source).toBe("override");
        expect(result[0]?.model).toBe("gpt-custom");
        expect(result[0]?.overrideId).toBe("o-only");
    });

    test("multiple regions for the same model yield distinct entries", async () => {
        const repo = makeRepo([
            row({ id: "g-us", provider: "openai", model: "gpt-4o", region: "us" }),
            row({ id: "g-eu", provider: "openai", model: "gpt-4o", region: "eu" }),
        ]);

        const result = await listEffectivePricing({
            pricing: repo,
            workspaceId: "ws-1",
            now,
        });

        expect(result.length).toBe(2);
        expect(result.map((e) => e.region)).toEqual(["eu", "us"]);
    });

    test("expired override falls back to the global row", async () => {
        const repo = makeRepo([
            row({
                id: "g-1",
                provider: "openai",
                model: "gpt-4o",
                region: "global",
                effectiveFrom: new Date("2024-01-01T00:00:00Z"),
                effectiveTo: null,
            }),
            row({
                id: "o-expired",
                workspaceId: "ws-1",
                provider: "openai",
                model: "gpt-4o",
                region: "global",
                effectiveFrom: new Date("2024-06-01T00:00:00Z"),
                effectiveTo: new Date("2024-12-31T00:00:00Z"),
            }),
        ]);

        const result = await listEffectivePricing({
            pricing: repo,
            workspaceId: "ws-1",
            now,
        });

        expect(result.length).toBe(1);
        expect(result[0]?.source).toBe("global");
        expect(result[0]?.overrideId).toBeNull();
    });

    test("other workspaces' overrides are ignored", async () => {
        const repo = makeRepo([
            row({
                id: "g-1",
                provider: "openai",
                model: "gpt-4o",
                region: "global",
                inputPer1mUsd: "0.0025",
            }),
            row({
                id: "o-other",
                workspaceId: "ws-2",
                provider: "openai",
                model: "gpt-4o",
                region: "global",
                inputPer1mUsd: "0.0001",
            }),
        ]);

        const result = await listEffectivePricing({
            pricing: repo,
            workspaceId: "ws-1",
            now,
        });

        expect(result.length).toBe(1);
        expect(result[0]?.source).toBe("global");
        expect(result[0]?.inputPer1mUsd).toBe("0.0025");
    });

    test("distinct tuples whose space-joined keys would collide are not merged", async () => {
        // "openai foo bar global" would equal "openai foo bar global" when
        // joined by spaces — different tuples must still produce two entries.
        const repo = makeRepo([
            row({ id: "a", provider: "openai", model: "foo bar", region: "global" }),
            row({ id: "b", provider: "openai", model: "foo", region: "bar global" }),
        ]);

        const result = await listEffectivePricing({
            pricing: repo,
            workspaceId: "ws-1",
            now,
        });

        expect(result.length).toBe(2);
        expect(result.map((e) => `${e.model}|${e.region}`).sort()).toEqual(
            ["foo bar|global", "foo|bar global"].sort(),
        );
    });

    test("results sorted by (provider, model, region) ascending", async () => {
        const repo = makeRepo([
            row({ id: "a", provider: "openai", model: "gpt-4o", region: "us" }),
            row({ id: "b", provider: "anthropic", model: "claude-3-5", region: "global" }),
            row({ id: "c", provider: "openai", model: "gpt-4o", region: "eu" }),
            row({ id: "d", provider: "openai", model: "gpt-3.5", region: "global" }),
        ]);

        const result = await listEffectivePricing({
            pricing: repo,
            workspaceId: "ws-1",
            now,
        });

        expect(result.map((e) => `${e.provider}/${e.model}/${e.region}`)).toEqual([
            "anthropic/claude-3-5/global",
            "openai/gpt-3.5/global",
            "openai/gpt-4o/eu",
            "openai/gpt-4o/us",
        ]);
    });
});
