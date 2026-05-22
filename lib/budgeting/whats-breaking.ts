/**
 * "What breaks first": pure ETA helper for the dashboard.
 *
 * Takes per-budget headroom rows, computes an ETA-to-exhaust for each, and
 * returns the list sorted by urgency (most urgent first).
 *
 * Pure: no DB, no clock reads. Caller resolves `spent`, `usage`, and `now`
 * upstream and feeds them in. ETA is a linear projection from a single
 * `dailyRate` (workspace-global $/day). Per-scope burn would be more precise,
 * but most workspaces have a handful of budgets and the global rate
 * approximates the per-scope rate well enough to surface order-of-magnitude
 * urgency.
 *
 * Sort order:
 *   1. Overage rows (`usage >= 1`) pin to top with `etaKind: "today"`.
 *   2. Rows with a finite ETA, ascending by `etaDays`.
 *   3. Rows that won't breach within the period (`etaKind: "safe"`),
 *      ascending by `periodEnd`.
 */

import type { BudgetMode, ScopeType } from "./budget";
import type { Period } from "./period";
import { periodWindow } from "./period";

export type EtaKind = "today" | "eta" | "safe";

export interface WhatsBreakingInput {
    /**
     * Per-budget headroom rows. The caller (the server loader) resolves
     * `spent` and `usage` via `getBudgetHeadroom` upstream and forwards them
     * here so the helper stays pure.
     */
    readonly budgets: readonly {
        readonly id: string;
        readonly scopeType: ScopeType;
        readonly scopeId: string | null;
        readonly period: Period;
        readonly mode: BudgetMode;
        readonly limit: number;
        readonly spent: number;
        /** spent / limit (raw; may exceed 1 on overage). */
        readonly usage: number;
    }[];
    /** Workspace-global $/day burn from `getProjectedEom`. */
    readonly dailyRate: number;
    readonly now: Date;
}

export interface WhatsBreakingRowSource {
    readonly kind: "budget";
    readonly budgetId: string;
}

export interface WhatsBreakingRow {
    readonly source: WhatsBreakingRowSource;
    readonly scopeType: ScopeType;
    readonly scopeId: string | null;
    readonly period: Period;
    readonly mode: BudgetMode;
    readonly limit: number;
    readonly spent: number;
    readonly usage: number;
    readonly etaKind: EtaKind;
    /** Days remaining when `etaKind === "eta"`; undefined otherwise. */
    readonly etaDays?: number;
    /** Calendar end of the budget's current period, used as date hint. */
    readonly periodEnd: Date;
}

const MS_PER_DAY = 86_400_000;

export function computeWhatsBreaking(input: WhatsBreakingInput): readonly WhatsBreakingRow[] {
    const rows = input.budgets.map((b) => projectBudget(b, input.dailyRate, input.now));
    return [...rows].sort(byUrgency);
}

function projectBudget(
    b: WhatsBreakingInput["budgets"][number],
    dailyRate: number,
    now: Date,
): WhatsBreakingRow {
    const { to: periodEnd } = periodWindow(b.period, now);
    const eta = classifyEta({
        remaining: b.limit - b.spent,
        dailyRate,
        now,
        periodEnd,
    });
    return {
        source: { kind: "budget", budgetId: b.id },
        scopeType: b.scopeType,
        scopeId: b.scopeId,
        period: b.period,
        mode: b.mode,
        limit: b.limit,
        spent: b.spent,
        usage: b.usage,
        periodEnd,
        ...eta,
    };
}

interface EtaInput {
    readonly remaining: number;
    readonly dailyRate: number;
    readonly now: Date;
    readonly periodEnd: Date;
}

type EtaResult =
    | { readonly etaKind: "today" }
    | { readonly etaKind: "safe" }
    | {
          readonly etaKind: "eta";
          readonly etaDays: number;
      };

function classifyEta(input: EtaInput): EtaResult {
    if (input.remaining <= 0) return { etaKind: "today" };
    if (input.dailyRate <= 0) return { etaKind: "safe" };
    const etaDays = input.remaining / input.dailyRate;
    const daysToPeriodEnd = (input.periodEnd.getTime() - input.now.getTime()) / MS_PER_DAY;
    if (etaDays > daysToPeriodEnd) return { etaKind: "safe" };
    return { etaKind: "eta", etaDays };
}

function byUrgency(a: WhatsBreakingRow, b: WhatsBreakingRow): number {
    const tierDiff = tier(a) - tier(b);
    if (tierDiff !== 0) return tierDiff;
    if (a.etaKind === "eta" && b.etaKind === "eta") {
        return (a.etaDays ?? 0) - (b.etaDays ?? 0);
    }
    if (a.etaKind === "safe" && b.etaKind === "safe") {
        return a.periodEnd.getTime() - b.periodEnd.getTime();
    }
    return 0;
}

function tier(r: WhatsBreakingRow): number {
    if (r.etaKind === "today") return 0;
    if (r.etaKind === "eta") return 1;
    return 2;
}
