/**
 * Tests for the sync-pricing use case.
 *
 * Behavior under test:
 *   1. Identical rate → no insert (idempotent)
 *   2. Differing rate → close previous (effective_to = now) + insert new (effective_from = now)
 *   3. New (provider, model) row with no existing → insert directly
 *   4. Workspace-scoped override rows are NOT touched by global sync
 *   5. One source throws → other sources still process, then the use case
 *      throws PricingSyncPartialFailure carrying the failed providers
 *   6. All sources succeed → heartbeat recorder is invoked with `now`
 *   7. Any source fails → heartbeat recorder is NOT invoked
 *
 * Tests use an in-memory mock repo and stub sources. They exercise the public
 * `syncPricing(sources, repo, now)` interface only — no DB, no HTTP.
 */

import type {
    NewPricingRow,
    PricingRepository,
    PricingRow,
} from "@/lib/metering/pricing/pricing-row";
import type { PricingSource, ScrapedRate } from "@/lib/metering/pricing/pricing-source";
import {
    PricingSyncPartialFailure,
    syncPricing,
} from "@/lib/metering/pricing/sync-pricing.usecase";
import { describe, expect, test } from "bun:test";

// -- Fixtures ----------------------------------------------------------------

const NOW = new Date("2025-05-10T12:00:00Z");
const EARLIER = new Date("2024-01-01T00:00:00Z");

const globalRow = (overrides: Partial<PricingRow> = {}): PricingRow => ({
    id: "row-1",
    workspaceId: null,
    provider: "openai",
    model: "gpt-4o",
    region: "global",
    inputPer1mUsd: "0.0025",
    outputPer1mUsd: "0.01",
    cachePer1mUsd: "0.00125",
    effectiveFrom: EARLIER,
    effectiveTo: null,
    ...overrides,
});

const scrapedRate = (overrides: Partial<ScrapedRate> = {}): ScrapedRate => ({
    provider: "openai",
    model: "gpt-4o",
    region: "global",
    inputPer1mUsd: "0.0025",
    outputPer1mUsd: "0.01",
    cachePer1mUsd: "0.00125",
    ...overrides,
});

// -- In-memory repo + source mocks -------------------------------------------

type RepoCalls = {
    closed: Array<{ id: string; effectiveTo: Date }>;
    inserted: NewPricingRow[];
};

const makeRepo = (initial: PricingRow[] = []): { repo: PricingRepository; calls: RepoCalls } => {
    const rows = [...initial];
    const calls: RepoCalls = { closed: [], inserted: [] };

    const repo: PricingRepository = {
        findLatestGlobal: async (provider, model, region) => {
            // Return the row with the latest effective_from for this triple where
            // workspaceId is null and effectiveTo is null (i.e., currently active).
            const matches = rows.filter(
                (r) =>
                    r.workspaceId === null &&
                    r.provider === provider &&
                    r.model === model &&
                    r.region === region &&
                    r.effectiveTo === null,
            );
            if (matches.length === 0) return null;
            return matches.reduce((a, b) => (a.effectiveFrom > b.effectiveFrom ? a : b));
        },
        closeAndInsert: async (toCloseId, effectiveTo, toInsert) => {
            calls.closed.push({ id: toCloseId, effectiveTo });
            calls.inserted.push(toInsert);
            // Mutate rows so subsequent calls see the new state.
            const idx = rows.findIndex((r) => r.id === toCloseId);
            if (idx !== -1) {
                rows[idx] = { ...rows[idx]!, effectiveTo };
            }
            rows.push({
                id: `inserted-${rows.length}`,
                workspaceId: null,
                ...toInsert,
                effectiveTo: null,
            });
        },
        insert: async (toInsert) => {
            calls.inserted.push(toInsert);
            rows.push({
                id: `inserted-${rows.length}`,
                workspaceId: null,
                ...toInsert,
                effectiveTo: null,
            });
        },
        findCandidatesForLookup: async ({ provider, model, region, workspaceId }) =>
            rows.filter(
                (r) =>
                    r.provider === provider &&
                    r.model === model &&
                    r.region === region &&
                    (r.workspaceId === null || r.workspaceId === workspaceId),
            ),
        findAllCandidatesForWorkspace: async (workspaceId) =>
            rows.filter((r) => r.workspaceId === null || r.workspaceId === workspaceId),
        insertOverride: async ({ workspaceId, row, effectiveTo }) => {
            const stored: PricingRow = {
                id: `override-${rows.length}`,
                workspaceId,
                provider: row.provider,
                model: row.model,
                region: row.region,
                inputPer1mUsd: row.inputPer1mUsd,
                outputPer1mUsd: row.outputPer1mUsd,
                cachePer1mUsd: row.cachePer1mUsd,
                effectiveFrom: row.effectiveFrom,
                effectiveTo,
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

    return { repo, calls };
};

const makeSource = (provider: string, rates: ScrapedRate[]): PricingSource => ({
    provider,
    fetchRates: async () => rates,
});

const makeFailingSource = (provider: string, message: string): PricingSource => ({
    provider,
    fetchRates: async () => {
        throw new Error(message);
    },
});

// -- Tests --------------------------------------------------------------------

describe("syncPricing", () => {
    test("identical rate → no insert (idempotent)", async () => {
        const { repo, calls } = makeRepo([globalRow()]);
        const source = makeSource("openai", [scrapedRate()]);

        const summary = await syncPricing([source], repo, NOW);

        expect(calls.inserted.length).toBe(0);
        expect(calls.closed.length).toBe(0);
        expect(summary.inserted).toBe(0);
        expect(summary.unchanged).toBe(1);
    });

    test("differing rate → close previous and insert new", async () => {
        const previous = globalRow({ inputPer1mUsd: "0.0025" });
        const { repo, calls } = makeRepo([previous]);
        const source = makeSource("openai", [scrapedRate({ inputPer1mUsd: "0.0030" })]);

        const summary = await syncPricing([source], repo, NOW);

        expect(calls.closed).toEqual([{ id: previous.id, effectiveTo: NOW }]);
        expect(calls.inserted.length).toBe(1);
        expect(calls.inserted[0]).toMatchObject({
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "0.0030",
            outputPer1mUsd: "0.01",
            cachePer1mUsd: "0.00125",
            effectiveFrom: NOW,
        });
        expect(summary.inserted).toBe(1);
        expect(summary.unchanged).toBe(0);
    });

    test("new (provider, model) with no existing row → insert directly", async () => {
        const { repo, calls } = makeRepo([]);
        const source = makeSource("openai", [
            scrapedRate({ model: "gpt-5", inputPer1mUsd: "0.005" }),
        ]);

        const summary = await syncPricing([source], repo, NOW);

        expect(calls.closed).toEqual([]);
        expect(calls.inserted.length).toBe(1);
        expect(calls.inserted[0]).toMatchObject({
            provider: "openai",
            model: "gpt-5",
            effectiveFrom: NOW,
        });
        expect(summary.inserted).toBe(1);
        expect(summary.unchanged).toBe(0);
    });

    test("workspace-scoped override row is not touched by global sync", async () => {
        // Two rows: a global current row (matches scraped rate) and a workspace
        // override row with a different rate. The override is for the same triple.
        const overrideRow: PricingRow = {
            ...globalRow({ id: "override-1", inputPer1mUsd: "0.0010" }),
            workspaceId: "ws-123",
        };
        const { repo, calls } = makeRepo([globalRow(), overrideRow]);
        const source = makeSource("openai", [scrapedRate()]);

        const summary = await syncPricing([source], repo, NOW);

        // Global rate matches → no-op. Override row must remain untouched: no
        // closed/inserted calls referencing it.
        expect(calls.closed).toEqual([]);
        expect(calls.inserted).toEqual([]);
        expect(summary.inserted).toBe(0);
        expect(summary.unchanged).toBe(1);
    });

    test("workspace override is ignored even when scraped differs from override but matches global", async () => {
        // Global row has 0.0025; override has 0.0010; scraped has 0.0025. The
        // global row matches → no-op. The override must NOT be considered as the
        // current rate.
        const overrideRow: PricingRow = {
            ...globalRow({ id: "override-1", inputPer1mUsd: "0.0010" }),
            workspaceId: "ws-123",
        };
        const { repo, calls } = makeRepo([globalRow(), overrideRow]);
        const source = makeSource("openai", [scrapedRate({ inputPer1mUsd: "0.0025" })]);

        const summary = await syncPricing([source], repo, NOW);

        expect(calls.closed).toEqual([]);
        expect(calls.inserted).toEqual([]);
        expect(summary.unchanged).toBe(1);
    });

    test("one source throws → other sources still process, then throws PricingSyncPartialFailure", async () => {
        const { repo, calls } = makeRepo([]);
        const failing = makeFailingSource("anthropic", "network down");
        const ok = makeSource("openai", [scrapedRate({ provider: "openai", model: "gpt-5" })]);
        const okSecond = makeSource("google", [
            scrapedRate({ provider: "google", model: "gemini-pro" }),
        ]);

        let caught: unknown = null;
        try {
            await syncPricing([failing, ok, okSecond], repo, NOW);
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(PricingSyncPartialFailure);
        expect((caught as PricingSyncPartialFailure).failedProviders).toEqual(["anthropic"]);
        // Other sources still processed before the throw.
        expect(calls.inserted.length).toBe(2);
    });

    test("multiple sources fail → thrown error lists every failed provider", async () => {
        const { repo } = makeRepo([]);
        const failingA = makeFailingSource("anthropic", "boom");
        const failingB = makeFailingSource("google", "timeout");

        let caught: unknown = null;
        try {
            await syncPricing([failingA, failingB], repo, NOW);
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(PricingSyncPartialFailure);
        expect((caught as PricingSyncPartialFailure).failedProviders).toEqual([
            "anthropic",
            "google",
        ]);
    });

    test("all sources succeed → heartbeat recorder is invoked with `now`", async () => {
        const { repo } = makeRepo([]);
        const source = makeSource("openai", [scrapedRate({ model: "gpt-5" })]);

        const recordedAt: Date[] = [];
        const recordHeartbeat = async (at: Date): Promise<void> => {
            recordedAt.push(at);
        };

        await syncPricing([source], repo, NOW, { recordHeartbeat });

        expect(recordedAt).toEqual([NOW]);
    });

    test("any source fails → heartbeat recorder is NOT invoked", async () => {
        const { repo } = makeRepo([]);
        const failing = makeFailingSource("anthropic", "network down");
        const ok = makeSource("openai", [scrapedRate({ model: "gpt-5" })]);

        let called = false;
        const recordHeartbeat = async (): Promise<void> => {
            called = true;
        };

        try {
            await syncPricing([failing, ok], repo, NOW, { recordHeartbeat });
        } catch {
            // Expected.
        }

        expect(called).toBe(false);
    });
});
