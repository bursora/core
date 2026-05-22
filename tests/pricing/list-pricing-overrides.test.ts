/**
 * Tests for the listPricingOverrides use case.
 *
 * Behavior under test:
 *   1. Returns only rows belonging to the requested workspace.
 *   2. Excludes global rows (workspaceId === null).
 *   3. Excludes other workspaces' overrides.
 *   4. Returns an empty array when there are no overrides for the workspace.
 */

import { listPricingOverrides } from "@/lib/metering/pricing/list-pricing-overrides.usecase";
import type { PricingRepository, PricingRow } from "@/lib/metering/pricing/pricing-row";
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

const makeRepo = (initial: PricingRow[] = []): PricingRepository => {
    const rows = [...initial];
    return {
        findLatestGlobal: async () => null,
        closeAndInsert: async () => {},
        insert: async () => {},
        findCandidatesForLookup: async () => rows,
        findAllCandidatesForWorkspace: async (workspaceId) =>
            rows.filter((r) => r.workspaceId === null || r.workspaceId === workspaceId),
        insertOverride: async (input) => {
            const stored: PricingRow = {
                id: `inserted-${rows.length}`,
                workspaceId: input.workspaceId,
                provider: input.row.provider,
                model: input.row.model,
                region: input.row.region,
                inputPer1mUsd: input.row.inputPer1mUsd,
                outputPer1mUsd: input.row.outputPer1mUsd,
                cachePer1mUsd: input.row.cachePer1mUsd,
                effectiveFrom: input.row.effectiveFrom,
                effectiveTo: input.effectiveTo,
            };
            rows.push(stored);
            return stored;
        },
        listOverridesByWorkspace: async (workspaceId) =>
            rows.filter((r) => r.workspaceId === workspaceId),
        deleteOverride: async ({ id, workspaceId }) => {
            const idx = rows.findIndex((r) => r.id === id && r.workspaceId === workspaceId);
            if (idx === -1) return false;
            rows.splice(idx, 1);
            return true;
        },
        updateOverride: async () => null,
    };
};

describe("listPricingOverrides", () => {
    test("returns only rows for the requested workspace", async () => {
        const repo = makeRepo([
            row({ id: "ws1-a", workspaceId: "ws-1", inputPer1mUsd: "0.001" }),
            row({ id: "ws1-b", workspaceId: "ws-1", inputPer1mUsd: "0.002" }),
            row({ id: "ws2", workspaceId: "ws-2", inputPer1mUsd: "0.003" }),
        ]);

        const result = await listPricingOverrides({
            pricing: repo,
            workspaceId: "ws-1",
        });

        expect(result.map((r) => r.id).sort()).toEqual(["ws1-a", "ws1-b"]);
    });

    test("excludes global rows", async () => {
        const repo = makeRepo([
            row({ id: "global-a", workspaceId: null }),
            row({ id: "ws1", workspaceId: "ws-1" }),
        ]);

        const result = await listPricingOverrides({
            pricing: repo,
            workspaceId: "ws-1",
        });

        expect(result.length).toBe(1);
        expect(result[0]?.id).toBe("ws1");
    });

    test("returns empty array when workspace has no overrides", async () => {
        const repo = makeRepo([row({ id: "global-a", workspaceId: null })]);

        const result = await listPricingOverrides({
            pricing: repo,
            workspaceId: "ws-1",
        });

        expect(result).toEqual([]);
    });
});
