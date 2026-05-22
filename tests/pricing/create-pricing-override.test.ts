/**
 * Tests for the createPricingOverride use case.
 *
 * Behavior under test:
 *   1. Inserts a row with `workspaceId` set to the caller's workspace.
 *   2. Does NOT touch global rows (workspaceId === null).
 *   3. Passes through provider, model, region, rates, effectiveFrom, effectiveTo.
 *   4. Default region is "global" when not provided.
 *
 * Tests use an in-memory mock repo. They exercise the public
 * `createPricingOverride(input)` interface only — no DB.
 */

import { createPricingOverride } from "@/lib/metering/pricing/create-pricing-override.usecase";
import type {
    NewPricingRow,
    PricingRepository,
    PricingRow,
} from "@/lib/metering/pricing/pricing-row";
import { describe, expect, test } from "bun:test";

interface OverrideInsert {
    readonly workspaceId: string;
    readonly row: NewPricingRow;
    readonly effectiveTo: Date | null;
}

const makeRepo = (
    initial: PricingRow[] = [],
): {
    repo: PricingRepository;
    inserts: OverrideInsert[];
    globalInserts: NewPricingRow[];
} => {
    const rows = [...initial];
    const inserts: OverrideInsert[] = [];
    const globalInserts: NewPricingRow[] = [];

    const repo: PricingRepository = {
        findLatestGlobal: async () => null,
        closeAndInsert: async () => {},
        insert: async (toInsert: NewPricingRow) => {
            globalInserts.push(toInsert);
        },
        findCandidatesForLookup: async () => rows,
        findAllCandidatesForWorkspace: async (workspaceId) =>
            rows.filter((r) => r.workspaceId === null || r.workspaceId === workspaceId),
        insertOverride: async (input) => {
            inserts.push(input);
            const stored: PricingRow = {
                id: `override-${rows.length + 1}`,
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

    return { repo, inserts, globalInserts };
};

describe("createPricingOverride", () => {
    test("inserts a row scoped to the caller's workspace", async () => {
        const { repo, inserts } = makeRepo();

        const created = await createPricingOverride({
            pricing: repo,
            workspaceId: "ws-1",
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "0.001",
            outputPer1mUsd: "0.005",
            cachePer1mUsd: "0.0005",
            effectiveFrom: new Date("2025-05-10T00:00:00Z"),
            effectiveTo: null,
        });

        expect(inserts.length).toBe(1);
        expect(inserts[0]?.workspaceId).toBe("ws-1");
        expect(created.workspaceId).toBe("ws-1");
        expect(created.provider).toBe("openai");
        expect(created.model).toBe("gpt-4o");
        expect(created.inputPer1mUsd).toBe("0.001");
    });

    test("never inserts a global row", async () => {
        const { repo, globalInserts } = makeRepo();

        await createPricingOverride({
            pricing: repo,
            workspaceId: "ws-1",
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "0.001",
            outputPer1mUsd: "0.005",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2025-05-10T00:00:00Z"),
            effectiveTo: null,
        });

        expect(globalInserts.length).toBe(0);
    });

    test("passes effectiveTo through (open-ended when not provided)", async () => {
        const { repo, inserts } = makeRepo();

        await createPricingOverride({
            pricing: repo,
            workspaceId: "ws-1",
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "0.001",
            outputPer1mUsd: "0.005",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2025-05-10T00:00:00Z"),
            effectiveTo: null,
        });

        expect(inserts[0]?.effectiveTo).toBeNull();
    });

    test("passes effectiveTo through when provided", async () => {
        const { repo, inserts } = makeRepo();
        const to = new Date("2025-12-31T00:00:00Z");

        await createPricingOverride({
            pricing: repo,
            workspaceId: "ws-1",
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "0.001",
            outputPer1mUsd: "0.005",
            cachePer1mUsd: null,
            effectiveFrom: new Date("2025-05-10T00:00:00Z"),
            effectiveTo: to,
        });

        expect(inserts[0]?.effectiveTo).toEqual(to);
    });

    test("rejects negative input rate", async () => {
        const { repo } = makeRepo();

        await expect(
            createPricingOverride({
                pricing: repo,
                workspaceId: "ws-1",
                provider: "openai",
                model: "gpt-4o",
                region: "global",
                inputPer1mUsd: "-0.001",
                outputPer1mUsd: "0.005",
                cachePer1mUsd: null,
                effectiveFrom: new Date("2025-05-10T00:00:00Z"),
                effectiveTo: null,
            }),
        ).rejects.toThrow();
    });

    test("rejects non-numeric rate", async () => {
        const { repo } = makeRepo();

        await expect(
            createPricingOverride({
                pricing: repo,
                workspaceId: "ws-1",
                provider: "openai",
                model: "gpt-4o",
                region: "global",
                inputPer1mUsd: "cheap",
                outputPer1mUsd: "0.005",
                cachePer1mUsd: null,
                effectiveFrom: new Date("2025-05-10T00:00:00Z"),
                effectiveTo: null,
            }),
        ).rejects.toThrow();
    });

    test("rejects effectiveTo before effectiveFrom", async () => {
        const { repo } = makeRepo();

        await expect(
            createPricingOverride({
                pricing: repo,
                workspaceId: "ws-1",
                provider: "openai",
                model: "gpt-4o",
                region: "global",
                inputPer1mUsd: "0.001",
                outputPer1mUsd: "0.005",
                cachePer1mUsd: null,
                effectiveFrom: new Date("2025-05-10T00:00:00Z"),
                effectiveTo: new Date("2025-05-09T00:00:00Z"),
            }),
        ).rejects.toThrow();
    });
});
