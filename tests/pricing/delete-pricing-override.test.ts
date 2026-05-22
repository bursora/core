/**
 * Tests for the deletePricingOverride use case.
 *
 * Behavior under test:
 *   1. Deletes the row when it belongs to the caller's workspace.
 *   2. Returns false (no delete) when the row belongs to a different workspace.
 *   3. Returns false when the row does not exist.
 *   4. Never deletes global rows (workspaceId === null) regardless of id.
 */

import { deletePricingOverride } from "@/lib/metering/pricing/delete-pricing-override.usecase";
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

const makeRepo = (initial: PricingRow[] = []): { repo: PricingRepository; rows: PricingRow[] } => {
    const rows = [...initial];
    const repo: PricingRepository = {
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
    return { repo, rows };
};

describe("deletePricingOverride", () => {
    test("deletes a row owned by the caller's workspace", async () => {
        const { repo, rows } = makeRepo([row({ id: "ws1", workspaceId: "ws-1" })]);

        const result = await deletePricingOverride({
            pricing: repo,
            workspaceId: "ws-1",
            id: "ws1",
        });

        expect(result).toBe(true);
        expect(rows.length).toBe(0);
    });

    test("returns false when the row belongs to another workspace", async () => {
        const { repo, rows } = makeRepo([row({ id: "ws2", workspaceId: "ws-2" })]);

        const result = await deletePricingOverride({
            pricing: repo,
            workspaceId: "ws-1",
            id: "ws2",
        });

        expect(result).toBe(false);
        expect(rows.length).toBe(1);
    });

    test("returns false when no row matches", async () => {
        const { repo } = makeRepo([]);

        const result = await deletePricingOverride({
            pricing: repo,
            workspaceId: "ws-1",
            id: "missing",
        });

        expect(result).toBe(false);
    });

    test("never deletes a global row (workspaceId IS NULL)", async () => {
        const { repo, rows } = makeRepo([row({ id: "global-a", workspaceId: null })]);

        const result = await deletePricingOverride({
            pricing: repo,
            workspaceId: "ws-1",
            id: "global-a",
        });

        expect(result).toBe(false);
        expect(rows.length).toBe(1);
    });
});
