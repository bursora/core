/**
 * Tests for the "what breaks first" pure helper.
 *
 * `computeWhatsBreaking` takes already-resolved per-budget headroom rows,
 * projects an ETA-to-exhaust per row, and returns the rows sorted by urgency.
 * The helper is pure: no DB, no clock — caller passes `now`.
 *
 * Sort order:
 *   1. Overage rows (`usage >= 1`) pin to top, ETA = "today".
 *   2. Rows with a finite ETA come next, ascending.
 *   3. Rows that won't breach within the period come last, period-end ascending.
 */

import { computeWhatsBreaking, type WhatsBreakingInput } from "@/lib/budgeting/whats-breaking";
import { describe, expect, test } from "bun:test";

const NOW = new Date("2025-05-10T12:00:00.000Z");

const baseBudget = (over: Partial<WhatsBreakingInput["budgets"][number]> = {}) => ({
    id: over.id ?? "b-1",
    scopeType: over.scopeType ?? ("tenant" as const),
    scopeId: over.scopeId ?? "acme",
    period: over.period ?? ("monthly" as const),
    mode: over.mode ?? ("block" as const),
    limit: over.limit ?? 500,
    spent: over.spent ?? 0,
    usage: over.usage ?? 0,
});

describe("computeWhatsBreaking", () => {
    test("single budget with positive headroom and reasonable burn returns ETA = remaining/dailyRate", () => {
        // $500 limit, $100 spent → $400 remaining; $50/day → 8 days to exhaust.
        const rows = computeWhatsBreaking({
            budgets: [baseBudget({ limit: 500, spent: 100, usage: 0.2 })],
            dailyRate: 50,
            now: NOW,
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]?.etaKind).toBe("eta");
        expect(rows[0]?.etaDays).toBe(8);
    });

    test("overage budget (usage > 1) becomes etaKind 'today' regardless of dailyRate", () => {
        const rows = computeWhatsBreaking({
            budgets: [baseBudget({ limit: 500, spent: 600, usage: 1.2 })],
            dailyRate: 50,
            now: NOW,
        });

        expect(rows[0]?.etaKind).toBe("today");
        expect(rows[0]?.etaDays).toBeUndefined();
    });

    test("zero-headroom budget (usage exactly 1) becomes etaKind 'today'", () => {
        const rows = computeWhatsBreaking({
            budgets: [baseBudget({ limit: 500, spent: 500, usage: 1 })],
            dailyRate: 50,
            now: NOW,
        });

        expect(rows[0]?.etaKind).toBe("today");
    });

    test("zero daily rate yields 'safe through period'", () => {
        const rows = computeWhatsBreaking({
            budgets: [baseBudget({ limit: 500, spent: 100, usage: 0.2 })],
            dailyRate: 0,
            now: NOW,
        });

        expect(rows[0]?.etaKind).toBe("safe");
        expect(rows[0]?.etaDays).toBeUndefined();
    });

    test("ETA exceeding days-to-period-end yields 'safe through period'", () => {
        // $500 limit, $50 spent → $450 remaining; $1/day → 450 days. Period ends in May → ~21 days remain.
        const rows = computeWhatsBreaking({
            budgets: [baseBudget({ limit: 500, spent: 50, usage: 0.1 })],
            dailyRate: 1,
            now: NOW,
        });

        expect(rows[0]?.etaKind).toBe("safe");
    });

    test("sort: overage > breach-soon > breach-later > safe", () => {
        // dailyRate = $50/day across all rows. Period ends ~21 days out from NOW.
        // overage:    spent 600/500 → today (priority 0)
        // soon:       spent 100/500 → 400/50 = 8 days (priority 1)
        // later:      spent 50/500  → 450/50 = 9 days (priority 1)
        // safe:       spent 50/5000 → 4950/50 = 99 days > 21 → safe (priority 2)
        const rows = computeWhatsBreaking({
            budgets: [
                baseBudget({ id: "later", limit: 500, spent: 50, usage: 0.1 }),
                baseBudget({ id: "safe", limit: 5000, spent: 50, usage: 0.01 }),
                baseBudget({ id: "overage", limit: 500, spent: 600, usage: 1.2 }),
                baseBudget({ id: "soon", limit: 500, spent: 100, usage: 0.2 }),
            ],
            dailyRate: 50,
            now: NOW,
        });

        expect(rows.map((r) => r.source.budgetId)).toEqual(["overage", "soon", "later", "safe"]);
    });
});
