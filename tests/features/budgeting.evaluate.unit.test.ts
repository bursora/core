/**
 * Pure unit tests for `evaluateBudget` accessed via `@/features/budgeting`.
 *
 * Covers: under, near-budget, over (block/throttle/notify), paused (via
 * absence of matching rows in scope), and daily/weekly/monthly windows
 * exercised through periodFrom keys.
 */

import type { Budget } from "@/lib/budgeting";
import { evaluateBudget, spendKey } from "@/lib/budgeting";
import { describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

const periodFromDaily = new Date("2025-05-10T00:00:00.000Z");
const periodToDaily = new Date("2025-05-11T00:00:00.000Z");
const periodFromWeekly = new Date("2025-05-05T00:00:00.000Z"); // Monday
const periodToWeekly = new Date("2025-05-12T00:00:00.000Z");
const periodFromMonthly = new Date("2025-05-01T00:00:00.000Z");
const periodToMonthly = new Date("2025-06-01T00:00:00.000Z");

const budget = (overrides: Partial<Budget> = {}): Budget => ({
    id: "b-1",
    workspaceId: WORKSPACE,
    scopeType: "workspace",
    scopeId: null,
    period: "daily",
    amountUsd: "100.00",
    mode: "block",
    periodFrom: periodFromDaily,
    periodTo: periodToDaily,
    ...overrides,
});

const snapshotOf = (entries: Record<string, number>): { get(k: string): number } => ({
    get: (k: string): number => entries[k] ?? 0,
});

describe("evaluateBudget (feature surface)", () => {
    test("under budget → allow, mode=notify, reason mentions 'under'", () => {
        const b = budget();
        const snap = snapshotOf({ [spendKey("workspace", null, periodFromDaily)]: 25 });
        const { decision: d } = evaluateBudget(snap, [b]);
        expect(d.allow).toBe(true);
        expect(d.mode).toBe("notify");
        expect(d.reason).toContain("under");
    });

    test("near budget (just under) still allow", () => {
        const b = budget({ amountUsd: "100" });
        const snap = snapshotOf({ [spendKey("workspace", null, periodFromDaily)]: 99.5 });
        const { decision: d } = evaluateBudget(snap, [b]);
        expect(d.allow).toBe(true);
    });

    test("over budget with block mode → deny", () => {
        const b = budget({ mode: "block", amountUsd: "100" });
        const snap = snapshotOf({ [spendKey("workspace", null, periodFromDaily)]: 100 });
        const { decision: d } = evaluateBudget(snap, [b]);
        expect(d.allow).toBe(false);
        expect(d.mode).toBe("block");
        expect(d.reason).toContain("over");
    });

    test("over budget with throttle mode → allow but mode=throttle", () => {
        const b = budget({ mode: "throttle", amountUsd: "100" });
        const snap = snapshotOf({ [spendKey("workspace", null, periodFromDaily)]: 150 });
        const { decision: d } = evaluateBudget(snap, [b]);
        expect(d.allow).toBe(true);
        expect(d.mode).toBe("throttle");
    });

    test("over budget with notify mode → allow, mode=notify", () => {
        const b = budget({ mode: "notify", amountUsd: "100" });
        const snap = snapshotOf({ [spendKey("workspace", null, periodFromDaily)]: 999 });
        const { decision: d } = evaluateBudget(snap, [b]);
        expect(d.allow).toBe(true);
        expect(d.mode).toBe("notify");
    });

    test("empty (paused) budgets → allow with reason 'no_budget'", () => {
        const { decision: d } = evaluateBudget({ get: () => 0 }, []);
        expect(d.allow).toBe(true);
        expect(d.reason).toBe("no_budget");
    });

    test("weekly window: spend keyed on weekly periodFrom is read", () => {
        const b = budget({
            period: "weekly",
            periodFrom: periodFromWeekly,
            periodTo: periodToWeekly,
            amountUsd: "50",
        });
        const snap = snapshotOf({ [spendKey("workspace", null, periodFromWeekly)]: 60 });
        const { decision: d } = evaluateBudget(snap, [b]);
        expect(d.allow).toBe(false);
    });

    test("monthly window: spend keyed on monthly periodFrom is read", () => {
        const b = budget({
            period: "monthly",
            periodFrom: periodFromMonthly,
            periodTo: periodToMonthly,
            amountUsd: "500",
        });
        const snap = snapshotOf({ [spendKey("workspace", null, periodFromMonthly)]: 100 });
        const { decision: d } = evaluateBudget(snap, [b]);
        expect(d.allow).toBe(true);
    });

    test("multi-scope: block beats throttle beats notify", () => {
        const a = budget({ id: "a", scopeType: "workspace", amountUsd: "10", mode: "notify" });
        const b2 = budget({
            id: "b",
            scopeType: "tenant",
            scopeId: "t1",
            amountUsd: "10",
            mode: "throttle",
        });
        const c = budget({
            id: "c",
            scopeType: "agent",
            scopeId: "ag1",
            amountUsd: "10",
            mode: "block",
        });
        const snap = snapshotOf({
            [spendKey("workspace", null, periodFromDaily)]: 20,
            [spendKey("tenant", "t1", periodFromDaily)]: 20,
            [spendKey("agent", "ag1", periodFromDaily)]: 20,
        });
        const { decision: d } = evaluateBudget(snap, [a, b2, c]);
        expect(d.mode).toBe("block");
        expect(d.allow).toBe(false);
    });

    test("ttlSeconds option overrides default", () => {
        const { decision: d } = evaluateBudget({ get: () => 0 }, [], { ttlSeconds: 7 });
        expect(d.ttl_s).toBe(7);
    });
});
