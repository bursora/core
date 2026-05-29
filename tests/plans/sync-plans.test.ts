/**
 * Tests for the plan sync use case.
 *
 * Behavior under test:
 *   1. Happy path: fetch → upsert creates a plan row carrying LS
 *      name/description/price/interval/currency plus the merged code-config.
 *   2. Idempotent: running twice upserts the same `lsVariantId`, no duplicate.
 *   3. Skip-when-no-LS: the seeder guard no-ops cleanly when LS keys are
 *      absent (see `shouldSyncPlans`).
 *
 * Tests exercise the public `syncPlans(source, repo, trackedPlans, now)`
 * interface with a fake source + in-memory repo — no DB, no HTTP.
 */

import type { Plan, PlanSyncRepository, PlanUpsert } from "@/lib/plans/plan";
import type { TrackedPlan } from "@/lib/plans/plan-config";
import type { FetchedPlan, PlanSource } from "@/lib/plans/plan-source";
import { shouldSyncPlans, syncPlans } from "@/lib/plans/sync-plans.usecase";
import { describe, expect, test } from "bun:test";

const NOW = new Date("2026-05-29T12:00:00Z");

const fetchedPlan = (overrides: Partial<FetchedPlan> = {}): FetchedPlan => ({
    lsProductId: "1093107",
    lsVariantId: "1712197",
    name: "Default",
    description: "<p>Bursora Cloud</p>",
    priceCents: 2900,
    currency: "USD",
    interval: "month",
    intervalCount: 1,
    ...overrides,
});

const trackedPlan = (overrides: Partial<TrackedPlan> = {}): TrackedPlan => ({
    lsProductId: "1093107",
    config: { floorCents: 2900, capCents: 49900 },
    ...overrides,
});

const makeSource = (plans: FetchedPlan[]): PlanSource => ({
    fetchPlans: async () => plans,
});

// In-memory repo keyed on `lsVariantId` so a second upsert lands on the same
// logical row (mirrors the unique constraint on the table).
const makeRepo = (): { repo: PlanSyncRepository; rows: () => Plan[] } => {
    const byVariant = new Map<string, Plan>();
    const repo: PlanSyncRepository = {
        upsertByVariant: async (plan: PlanUpsert) => {
            const existing = byVariant.get(plan.lsVariantId);
            byVariant.set(plan.lsVariantId, {
                id: existing?.id ?? `plan-${byVariant.size}`,
                isActive: existing?.isActive ?? true,
                ...plan,
            });
        },
    };
    return { repo, rows: () => [...byVariant.values()] };
};

describe("syncPlans", () => {
    test("happy path: upsert creates a row with LS facts + merged config", async () => {
        const source = makeSource([fetchedPlan()]);
        const { repo, rows } = makeRepo();

        await syncPlans(source, repo, [trackedPlan()], NOW);

        expect(rows()).toHaveLength(1);
        expect(rows()[0]).toMatchObject({
            lsProductId: "1093107",
            lsVariantId: "1712197",
            name: "Default",
            description: "<p>Bursora Cloud</p>",
            priceCents: 2900,
            currency: "USD",
            interval: "month",
            intervalCount: 1,
            config: { floorCents: 2900, capCents: 49900 },
            syncedAt: NOW,
        });
    });

    test("idempotent: a second run updates the same row, no duplicate", async () => {
        const { repo, rows } = makeRepo();
        const later = new Date("2026-06-01T00:00:00Z");

        await syncPlans(makeSource([fetchedPlan({ priceCents: 2900 })]), repo, [trackedPlan()], NOW);
        const firstId = rows()[0]?.id;

        // Same variant, new price/name → must land on the same logical row.
        await syncPlans(
            makeSource([fetchedPlan({ priceCents: 3900, name: "Pro" })]),
            repo,
            [trackedPlan()],
            later,
        );

        expect(rows()).toHaveLength(1);
        expect(rows()[0]?.id).toBe(firstId);
        expect(rows()[0]).toMatchObject({ priceCents: 3900, name: "Pro", syncedAt: later });
    });

    test("untracked product is skipped, not persisted", async () => {
        const { repo, rows } = makeRepo();

        const summary = await syncPlans(
            makeSource([fetchedPlan({ lsProductId: "9999999", lsVariantId: "8888888" })]),
            repo,
            [trackedPlan()],
            NOW,
        );

        expect(rows()).toHaveLength(0);
        expect(summary).toEqual({ upserted: 0, skipped: 1 });
    });
});

describe("shouldSyncPlans", () => {
    test("true on cloud with LS api key + store id", () => {
        expect(shouldSyncPlans({ isCloud: true, apiKey: "k", storeId: "389222" })).toBe(true);
    });

    test("false off cloud", () => {
        expect(shouldSyncPlans({ isCloud: false, apiKey: "k", storeId: "389222" })).toBe(false);
    });

    test("false when LS keys absent", () => {
        expect(shouldSyncPlans({ isCloud: true, apiKey: "", storeId: "" })).toBe(false);
    });
});
