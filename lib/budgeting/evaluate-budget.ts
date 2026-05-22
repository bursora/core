/**
 * evaluateBudget — DEEP MODULE.
 *
 * Pure function: given a spend snapshot and the budget rows that apply to a
 * request scope, return an enforcement Outcome. No DB, no clock, no network.
 *
 * Outcome:
 *   - `decision`: the SDK-facing Decision (allow/mode/reason/ttl_s plus the
 *     `remainingUsd`/`resetAt` headroom snapshot).
 *   - `trigger`: present only when an over-budget row won — carries the
 *     winning budget id, scope, period boundary, used/limit, and mode. The
 *     decideBudget orchestrator uses this for crossing-based notifications.
 *
 * Severity precedence (most → least restrictive):
 *   block > throttle > notify
 *
 * Policy:
 *   - At budget exactly (spend === amount) is treated as over (>=).
 *   - Notify never blocks. Over notify → allow=true, mode=notify, trigger set.
 *   - Throttle does not block; mode='throttle' signals the SDK to slow.
 *   - Empty budgets list → allow=true, mode='notify', reason='no_budget',
 *     remainingUsd=0, resetAt='' (empty-string sentinel), no trigger.
 *   - Under all budgets → allow=true, mode='notify', reason under the
 *     strictest under-budget row, no trigger. `remainingUsd` and `resetAt`
 *     come from that strictest-under row.
 *   - Over one or more budgets → headroom comes from the winning trip row
 *     (most-restrictive mode); `remainingUsd = max(0, limit - used)`,
 *     `resetAt = periodTo.toISOString()`.
 *
 * TTL contract:
 *   - `ttlSeconds` (default 60) applies to allow outcomes when no `block`
 *     budget exists in scope. Chatty SDKs cache the happy path.
 *   - When at least one `block` budget is in scope, both allow and block
 *     decisions return `ttl_s = 0` so the SDK pre-flights every call. Cap
 *     raises reach SDK behavior instantly.
 *
 * Overshoot:
 *   - Bursora can't predict the cost of an in-flight call, so a single
 *     sequential call can land slightly over the cap. Users who need a
 *     strict bound set the cap with that headroom in mind.
 */

import type { Budget, BudgetMode, Decision } from "./budget";
import type { Spend } from "./spend-snapshot";
import { spendKey } from "./spend-snapshot";

export interface EvaluateBudgetOptions {
    /** Long TTL (seconds) applied to every allow outcome. Default 60. */
    readonly ttlSeconds?: number;
}

export interface BudgetTrigger {
    readonly budgetId: string;
    readonly scopeType: Budget["scopeType"];
    readonly scopeId: string | null;
    readonly periodFrom: Date;
    readonly used: number;
    readonly limit: number;
    readonly mode: BudgetMode;
}

export interface EvaluateOutcome {
    readonly decision: Decision;
    readonly trigger?: BudgetTrigger;
}

const DEFAULT_TTL_SECONDS = 60;

export function evaluateBudget(
    spend: Spend,
    budgets: readonly Budget[],
    opts: EvaluateBudgetOptions = {},
): EvaluateOutcome {
    const longTtl = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    // Any block budget in scope flips ttl_s to 0 so the SDK pre-flights every
    // call and cap raises lift blocks instantly. No cache for block flows.
    const hasBlockBudget = budgets.some((b) => b.mode === "block");
    const allowTtl = hasBlockBudget ? 0 : longTtl;

    if (budgets.length === 0) {
        return {
            decision: {
                allow: true,
                mode: "notify",
                reason: "no_budget",
                ttl_s: allowTtl,
                remainingUsd: 0,
                resetAt: "",
            },
        };
    }

    const trips: TripContext[] = [];
    let strictestUnder: TripContext | null = null;

    for (const b of budgets) {
        const limit = parseLimit(b.amountUsd);
        const used = spend.get(spendKey(b.scopeType, b.scopeId, b.periodFrom));
        const ctx: TripContext = { budget: b, used, limit };

        if (used >= limit) {
            trips.push(ctx);
            continue;
        }

        const headroom = limit - used;
        if (strictestUnder === null || headroom < strictestUnder.limit - strictestUnder.used) {
            strictestUnder = ctx;
        }
    }

    if (trips.length > 0) {
        const [head, ...rest] = trips as [TripContext, ...TripContext[]];
        const winner = pickMostRestrictive(head, rest);
        // A block-mode winner means hasBlockBudget is true, which already
        // forced allowTtl=0, so the trip ttl_s is the same `allowTtl` value.
        return {
            decision: {
                allow: winner.budget.mode !== "block",
                mode: winner.budget.mode,
                reason: formatOverReason(winner),
                ttl_s: allowTtl,
                remainingUsd: computeRemainingUsd(winner),
                resetAt: winner.budget.periodTo.toISOString(),
            },
            trigger: toTrigger(winner),
        };
    }

    if (strictestUnder === null) {
        throw new Error("invariant: budgets non-empty and no trip should yield strictestUnder");
    }
    return {
        decision: {
            allow: true,
            mode: "notify",
            reason: formatUnderReason(strictestUnder),
            ttl_s: allowTtl,
            remainingUsd: computeRemainingUsd(strictestUnder),
            resetAt: strictestUnder.budget.periodTo.toISOString(),
        },
    };
}

function computeRemainingUsd(ctx: TripContext): number {
    return Math.max(0, ctx.limit - ctx.used);
}

interface TripContext {
    readonly budget: Budget;
    readonly used: number;
    readonly limit: number;
}

const SEVERITY: Record<BudgetMode, number> = {
    notify: 0,
    throttle: 1,
    block: 2,
};

function pickMostRestrictive(head: TripContext, rest: readonly TripContext[]): TripContext {
    let winner = head;
    for (const candidate of rest) {
        if (SEVERITY[candidate.budget.mode] > SEVERITY[winner.budget.mode]) {
            winner = candidate;
        }
    }
    return winner;
}

function toTrigger(ctx: TripContext): BudgetTrigger {
    return {
        budgetId: ctx.budget.id,
        scopeType: ctx.budget.scopeType,
        scopeId: ctx.budget.scopeId,
        periodFrom: ctx.budget.periodFrom,
        used: ctx.used,
        limit: ctx.limit,
        mode: ctx.budget.mode,
    };
}

function formatOverReason(ctx: TripContext): string {
    const scopeId = ctx.budget.scopeId ?? "*";
    return `${ctx.budget.scopeType}:${scopeId}:over:${formatNumber(ctx.used)}/${formatNumber(ctx.limit)}`;
}

function formatUnderReason(ctx: TripContext): string {
    const scopeId = ctx.budget.scopeId ?? "*";
    return `under:${ctx.budget.scopeType}:${scopeId}:${formatNumber(ctx.used)}/${formatNumber(ctx.limit)}`;
}

function parseLimit(amountUsd: string): number {
    const n = Number.parseFloat(amountUsd);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatNumber(n: number): string {
    return String(n);
}
