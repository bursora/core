/**
 * Tests for the evaluateBudget deep module.
 *
 * `evaluateBudget(spend, opts?) -> EvaluateOutcome` is pure: no DB,
 * no network, no clock. Given the spend per scope per period and a list of
 * matching budget rows, it returns:
 *   - `decision`: SDK-facing { allow, mode, reason, ttl_s }
 *   - `trigger?`: present only when an over-budget row won — carries the
 *     winning budget id + scope + period + used/limit for notification dedupe.
 *
 * Severity precedence: block > throttle > notify.
 */

import type { Budget, Spend } from "@/lib/budgeting";
import { evaluateBudget } from "@/lib/budgeting";
import { describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

const periodFrom = new Date("2025-05-10T00:00:00.000Z");
const periodTo = new Date("2025-05-11T00:00:00.000Z");

const budget = (overrides: Partial<Budget> = {}): Budget => ({
    id: "b-1",
    workspaceId: WORKSPACE,
    scopeType: "workspace",
    scopeId: null,
    period: "daily",
    amountUsd: "100.00",
    mode: "block",
    periodFrom,
    periodTo,
    ...overrides,
});

const spendOf = (entries: ReadonlyArray<readonly [Budget, number]>): Spend => {
    const map = new Map<string, number>();
    for (const [b, usd] of entries) {
        map.set(spendKey(b), usd);
    }
    return { get: (key) => map.get(key) ?? 0 };
};

const spendKey = (b: Budget): string =>
    `${b.scopeType}:${b.scopeId ?? ""}:${b.periodFrom.toISOString()}`;

describe("evaluateBudget decision", () => {
    test("under a single block-mode budget → allow=true, mode=notify, ttl_s=0 (hard-stop pre-flight)", () => {
        const b = budget({ amountUsd: "100", mode: "block" });
        const { decision: d } = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(d.allow).toBe(true);
        expect(d.mode).toBe("notify");
        expect(d.ttl_s).toBe(0);
        expect(d.reason).toContain("workspace");
    });

    test("at budget exactly (spend === amount) → over, block", () => {
        const b = budget({ amountUsd: "100", mode: "block" });
        const { decision: d } = evaluateBudget(spendOf([[b, 100]]), [b]);
        expect(d.allow).toBe(false);
        expect(d.mode).toBe("block");
    });

    test("over block-mode budget → allow=false, mode=block", () => {
        const b = budget({
            amountUsd: "50",
            mode: "block",
            scopeType: "agent",
            scopeId: "support-bot",
        });
        const { decision: d } = evaluateBudget(spendOf([[b, 75]]), [b]);
        expect(d.allow).toBe(false);
        expect(d.mode).toBe("block");
        expect(d.reason).toContain("agent");
        expect(d.reason).toContain("support-bot");
        expect(d.reason).toContain("75");
        expect(d.reason).toContain("50");
    });

    test("over notify-mode budget → allow=true, mode=notify (notify never blocks)", () => {
        const b = budget({ amountUsd: "10", mode: "notify" });
        const { decision: d } = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(d.allow).toBe(true);
        expect(d.mode).toBe("notify");
    });

    test("over throttle-mode budget → allow=true, mode=throttle", () => {
        const b = budget({ amountUsd: "10", mode: "throttle" });
        const { decision: d } = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(d.allow).toBe(true);
        expect(d.mode).toBe("throttle");
    });

    test("multi-scope: workspace block + tenant notify, both over → block wins", () => {
        const ws = budget({
            id: "b-ws",
            scopeType: "workspace",
            scopeId: null,
            amountUsd: "100",
            mode: "block",
        });
        const tenant = budget({
            id: "b-tenant",
            scopeType: "tenant",
            scopeId: "acme",
            amountUsd: "50",
            mode: "notify",
        });
        const { decision: d } = evaluateBudget(
            spendOf([
                [ws, 200],
                [tenant, 60],
            ]),
            [ws, tenant],
        );
        expect(d.allow).toBe(false);
        expect(d.mode).toBe("block");
    });

    test("multi-scope: workspace notify + tenant block, only tenant over → block wins", () => {
        const ws = budget({
            id: "b-ws",
            scopeType: "workspace",
            scopeId: null,
            amountUsd: "1000",
            mode: "notify",
        });
        const tenant = budget({
            id: "b-tenant",
            scopeType: "tenant",
            scopeId: "acme",
            amountUsd: "10",
            mode: "block",
        });
        const { decision: d } = evaluateBudget(
            spendOf([
                [ws, 5],
                [tenant, 25],
            ]),
            [ws, tenant],
        );
        expect(d.allow).toBe(false);
        expect(d.mode).toBe("block");
        expect(d.reason).toContain("tenant");
        expect(d.reason).toContain("acme");
    });

    test("multi-scope: workspace throttle (over) + agent block (under) → throttle wins", () => {
        const ws = budget({
            id: "b-ws",
            scopeType: "workspace",
            scopeId: null,
            amountUsd: "10",
            mode: "throttle",
        });
        const agent = budget({
            id: "b-agent",
            scopeType: "agent",
            scopeId: "x",
            amountUsd: "100",
            mode: "block",
        });
        const { decision: d } = evaluateBudget(
            spendOf([
                [ws, 25],
                [agent, 5],
            ]),
            [ws, agent],
        );
        expect(d.allow).toBe(true);
        expect(d.mode).toBe("throttle");
    });

    test("missing budget rows → allow=true, mode=notify, reason='no_budget'", () => {
        const { decision: d } = evaluateBudget(spendOf([]), []);
        expect(d.allow).toBe(true);
        expect(d.mode).toBe("notify");
        expect(d.reason).toBe("no_budget");
    });

    test("ttl_s defaults to 60 and is configurable via opts.ttlSeconds (no block budget in scope)", () => {
        const b = budget({ mode: "notify" });
        const { decision: d1 } = evaluateBudget(spendOf([[b, 0]]), [b]);
        expect(d1.ttl_s).toBe(60);
        const { decision: d2 } = evaluateBudget(spendOf([[b, 0]]), [b], { ttlSeconds: 5 });
        expect(d2.ttl_s).toBe(5);
    });

    test("reason format on over: includes scope_type:scope_id:over:<spend>/<limit>", () => {
        const b = budget({
            scopeType: "workflow",
            scopeId: "checkout",
            amountUsd: "12.34",
            mode: "block",
        });
        const { decision: d } = evaluateBudget(spendOf([[b, 99.5]]), [b]);
        expect(d.reason).toBe("workflow:checkout:over:99.5/12.34");
    });

    test("reason format on workspace-wide over uses '*' for null scope_id", () => {
        const b = budget({
            scopeType: "workspace",
            scopeId: null,
            amountUsd: "10",
            mode: "block",
        });
        const { decision: d } = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(d.reason).toBe("workspace:*:over:25/10");
    });

    test("multi-scope under all: reason references the strictest (lowest headroom) under budget", () => {
        const ws = budget({
            id: "b-ws",
            scopeType: "workspace",
            scopeId: null,
            amountUsd: "100",
            mode: "block",
        });
        const tenant = budget({
            id: "b-tenant",
            scopeType: "tenant",
            scopeId: "acme",
            amountUsd: "20",
            mode: "block",
        });
        const { decision: d } = evaluateBudget(
            spendOf([
                [ws, 1],
                [tenant, 18],
            ]),
            [ws, tenant],
        );
        expect(d.allow).toBe(true);
        expect(d.reason).toContain("tenant");
        expect(d.reason).toContain("acme");
    });
});

describe("evaluateBudget headroom", () => {
    test("under-budget path emits remainingUsd=limit-used and resetAt=periodTo ISO", () => {
        const b = budget({ amountUsd: "100", mode: "block" });
        const { decision: d } = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(d.remainingUsd).toBe(75);
        expect(d.resetAt).toBe(periodTo.toISOString());
    });

    test("over-block path emits remainingUsd=0 (never negative) and resetAt=periodTo ISO", () => {
        const b = budget({ amountUsd: "50", mode: "block" });
        const { decision: d } = evaluateBudget(spendOf([[b, 75]]), [b]);
        expect(d.remainingUsd).toBe(0);
        expect(d.resetAt).toBe(periodTo.toISOString());
    });

    test("over-throttle path emits remainingUsd=0 and resetAt=periodTo ISO", () => {
        const b = budget({ amountUsd: "10", mode: "throttle" });
        const { decision: d } = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(d.remainingUsd).toBe(0);
        expect(d.resetAt).toBe(periodTo.toISOString());
    });

    test("over-notify path emits remainingUsd=0 and resetAt=periodTo ISO", () => {
        const b = budget({ amountUsd: "10", mode: "notify" });
        const { decision: d } = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(d.remainingUsd).toBe(0);
        expect(d.resetAt).toBe(periodTo.toISOString());
    });

    test("no-budgets branch emits remainingUsd=0 and empty resetAt sentinel", () => {
        const { decision: d } = evaluateBudget(spendOf([]), []);
        expect(d.remainingUsd).toBe(0);
        expect(d.resetAt).toBe("");
    });

    test("strictest-under wins when multiple under budgets: remainingUsd from row with lowest headroom", () => {
        const ws = budget({
            id: "b-ws",
            scopeType: "workspace",
            scopeId: null,
            amountUsd: "100",
            mode: "block",
        });
        const tenant = budget({
            id: "b-tenant",
            scopeType: "tenant",
            scopeId: "acme",
            amountUsd: "20",
            mode: "block",
        });
        const { decision: d } = evaluateBudget(
            spendOf([
                [ws, 1],
                [tenant, 18],
            ]),
            [ws, tenant],
        );
        // tenant headroom = 2 (winner), workspace headroom = 99
        expect(d.remainingUsd).toBe(2);
    });

    test("winning-trip row drives headroom on multi-scope over", () => {
        const ws = budget({
            id: "b-ws",
            scopeType: "workspace",
            scopeId: null,
            amountUsd: "100",
            mode: "notify",
        });
        const tenant = budget({
            id: "b-tenant",
            scopeType: "tenant",
            scopeId: "acme",
            amountUsd: "10",
            mode: "block",
            periodTo: new Date("2025-06-01T00:00:00.000Z"),
        });
        const { decision: d } = evaluateBudget(
            spendOf([
                [ws, 200],
                [tenant, 25],
            ]),
            [ws, tenant],
        );
        expect(d.remainingUsd).toBe(0);
        expect(d.resetAt).toBe("2025-06-01T00:00:00.000Z");
    });
});

describe("evaluateBudget ttl_s", () => {
    test("block trip → ttl_s=0 so cap raises lift blocks instantly", () => {
        const b = budget({ amountUsd: "10", mode: "block" });
        const { decision: d } = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(d.allow).toBe(false);
        expect(d.mode).toBe("block");
        expect(d.ttl_s).toBe(0);
    });

    test("over throttle (allow=true) → long ttl_s default 60 when no block budget in scope", () => {
        const b = budget({ amountUsd: "10", mode: "throttle" });
        const { decision: d } = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(d.allow).toBe(true);
        expect(d.mode).toBe("throttle");
        expect(d.ttl_s).toBe(60);
    });

    test("over notify (allow=true) → long ttl_s default 60", () => {
        const b = budget({ amountUsd: "10", mode: "notify" });
        const { decision: d } = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(d.allow).toBe(true);
        expect(d.mode).toBe("notify");
        expect(d.ttl_s).toBe(60);
    });

    test("under a block budget → ttl_s=0 so SDK pre-flights every call", () => {
        const b = budget({ amountUsd: "100", mode: "block" });
        const { decision: d } = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(d.allow).toBe(true);
        expect(d.ttl_s).toBe(0);
    });

    test("under a notify-only budget → long ttl_s default 60", () => {
        const b = budget({ amountUsd: "100", mode: "notify" });
        const { decision: d } = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(d.allow).toBe(true);
        expect(d.ttl_s).toBe(60);
    });

    test("no_budget allow path → long ttl_s default 60", () => {
        const { decision: d } = evaluateBudget(spendOf([]), []);
        expect(d.allow).toBe(true);
        expect(d.ttl_s).toBe(60);
    });

    test("opts.ttlSeconds overrides long ttl on notify-only allow path; block in scope forces 0", () => {
        const underBlock = budget({ amountUsd: "100", mode: "block" });
        const { decision: underBlockD } = evaluateBudget(
            spendOf([[underBlock, 25]]),
            [underBlock],
            {
                ttlSeconds: 999,
            },
        );
        expect(underBlockD.ttl_s).toBe(0);

        const underNotify = budget({ amountUsd: "100", mode: "notify" });
        const { decision: underNotifyD } = evaluateBudget(
            spendOf([[underNotify, 25]]),
            [underNotify],
            { ttlSeconds: 999 },
        );
        expect(underNotifyD.ttl_s).toBe(999);
    });

    test("multi-scope block trip → ttl_s=0", () => {
        const ws = budget({
            id: "b-ws",
            scopeType: "workspace",
            scopeId: null,
            amountUsd: "100",
            mode: "notify",
        });
        const tenant = budget({
            id: "b-tenant",
            scopeType: "tenant",
            scopeId: "acme",
            amountUsd: "10",
            mode: "block",
        });
        const { decision: d } = evaluateBudget(
            spendOf([
                [ws, 200],
                [tenant, 25],
            ]),
            [ws, tenant],
        );
        expect(d.allow).toBe(false);
        expect(d.mode).toBe("block");
        expect(d.ttl_s).toBe(0);
    });

    test("multi-scope throttle trip with under-block in scope → ttl_s=0 so SDK pre-flights and catches the eventual block trip", () => {
        const ws = budget({
            id: "b-ws",
            scopeType: "workspace",
            scopeId: null,
            amountUsd: "10",
            mode: "throttle",
        });
        const agent = budget({
            id: "b-agent",
            scopeType: "agent",
            scopeId: "x",
            amountUsd: "100",
            mode: "block",
        });
        const { decision: d } = evaluateBudget(
            spendOf([
                [ws, 25],
                [agent, 5],
            ]),
            [ws, agent],
        );
        expect(d.allow).toBe(true);
        expect(d.mode).toBe("throttle");
        expect(d.ttl_s).toBe(0);
    });
});

describe("evaluateBudget precision (#926)", () => {
    /**
     * `amountUsd` is `numeric(12,4)` in the budgets table; before #926 the
     * limit was parsed via `Number.parseFloat`, which loses precision at the
     * 4-decimal boundary. Switching to Big keeps the limit exact and the
     * comparison consistent. These tests pin behaviour at the boundaries
     * float misrepresents so a future revert to float arithmetic regresses
     * loudly instead of quietly mis-billing.
     */

    test("amountUsd at the numeric(12,4) sub-cent boundary: spend == limit ⇒ over", () => {
        // The smallest representable amount in numeric(12,4): 0.0001 USD.
        // Equal-is-over per the documented at-budget rule (>=).
        const b = budget({ amountUsd: "0.0001", mode: "block" });
        const { decision: d } = evaluateBudget(spendOf([[b, 0.0001]]), [b]);
        expect(d.allow).toBe(false);
        expect(d.mode).toBe("block");
    });

    test("amountUsd at numeric(12,4) max: 99_999_999.9999 USD compares without drift", () => {
        // Largest decimal value the column can store. Float `parseFloat`
        // round-trips this exactly via shortest-roundtrip, but Big preserves
        // the column shape regardless of how the JS literal renders.
        const b = budget({ amountUsd: "99999999.9999", mode: "block" });
        const { decision: under } = evaluateBudget(spendOf([[b, 99999999.9998]]), [b]);
        expect(under.allow).toBe(true);
        const { decision: over } = evaluateBudget(spendOf([[b, 99999999.9999]]), [b]);
        expect(over.allow).toBe(false);
    });

    test("amountUsd of 0.3 vs spend 0.3 ⇒ over (the 0.1+0.2 trap; equal-is-over preserved)", () => {
        // Big("0.3") is exactly 0.3 in decimal. Float `parseFloat("0.3")`
        // produces a value that is not exactly 0.3 (IEEE 754). The contract
        // must hold either way: at-budget exactly trips.
        const b = budget({ amountUsd: "0.3", mode: "block" });
        const { decision: d } = evaluateBudget(spendOf([[b, 0.3]]), [b]);
        expect(d.allow).toBe(false);
        expect(d.mode).toBe("block");
    });

    test("invariance: under-budget remainingUsd still uses limit - used arithmetic", () => {
        // After the Big refactor, the public Decision still emits numeric
        // remainingUsd. For a clean 100 / 25 split the remainder is exactly
        // 75 USD.
        const b = budget({ amountUsd: "100.0000", mode: "block" });
        const { decision: d } = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(d.remainingUsd).toBe(75);
    });
});

describe("evaluateBudget trigger", () => {
    test("absent when under all budgets", () => {
        const b = budget({ amountUsd: "100", mode: "block" });
        const result = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(result.trigger).toBeUndefined();
    });

    test("absent on empty budgets list", () => {
        const result = evaluateBudget(spendOf([]), []);
        expect(result.trigger).toBeUndefined();
    });

    test("present when over block budget, carries winning row context", () => {
        const b = budget({
            id: "b-block",
            scopeType: "tenant",
            scopeId: "acme",
            amountUsd: "50",
            mode: "block",
        });
        const result = evaluateBudget(spendOf([[b, 75]]), [b]);
        expect(result.trigger).toEqual({
            budgetId: "b-block",
            scopeType: "tenant",
            scopeId: "acme",
            periodFrom,
            used: 75,
            limit: 50,
            mode: "block",
        });
    });

    test("present when over notify budget (notify never blocks but still triggers)", () => {
        const b = budget({ id: "b-notify", amountUsd: "10", mode: "notify" });
        const result = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(result.trigger?.budgetId).toBe("b-notify");
        expect(result.trigger?.mode).toBe("notify");
        expect(result.trigger?.used).toBe(25);
        expect(result.trigger?.limit).toBe(10);
    });

    test("present when over throttle budget", () => {
        const b = budget({ id: "b-throttle", amountUsd: "10", mode: "throttle" });
        const result = evaluateBudget(spendOf([[b, 25]]), [b]);
        expect(result.trigger?.budgetId).toBe("b-throttle");
        expect(result.trigger?.mode).toBe("throttle");
    });

    test("multi-scope over: trigger reflects the most-restrictive winning row", () => {
        const ws = budget({
            id: "b-ws",
            scopeType: "workspace",
            scopeId: null,
            amountUsd: "100",
            mode: "notify",
        });
        const tenant = budget({
            id: "b-tenant",
            scopeType: "tenant",
            scopeId: "acme",
            amountUsd: "10",
            mode: "block",
        });
        const result = evaluateBudget(
            spendOf([
                [ws, 200],
                [tenant, 25],
            ]),
            [ws, tenant],
        );
        expect(result.trigger?.budgetId).toBe("b-tenant");
        expect(result.trigger?.mode).toBe("block");
    });
});
