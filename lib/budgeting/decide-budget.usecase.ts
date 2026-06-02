/**
 * decideBudget — orchestrator for the budget decision read path.
 *
 *   1. Load every budget row that applies to the request scope (workspace +
 *      optional tenant/agent/workflow) via the BudgetRepository.
 *   2. For each row, compute the period window in UTC.
 *   3. Query the SpendAggregator port for the spend in that scope+window.
 *   4. Build a Spend snapshot and run the pure `evaluateBudget` deep module.
 *   5. When the evaluator surfaces a winning over-budget trigger, return a
 *      `BudgetCrossingTrigger` so the caller can record the crossing
 *      (idempotent per workspace+budget+period) and publish a
 *      `BudgetAlertRaisedEvent` for the notification dispatcher.
 *
 * Decoupling: this use case never touches the alerts repository or the event
 * bus. It returns the decision plus, when applicable, a trigger object that
 * carries the crossing record to persist and a builder that produces the
 * event once the alert row id is known. Wiring lives in the composition root
 * (`server.ts`).
 */

import type { BudgetCrossingRecord } from "../detection/alert.repository";
import { errMessage } from "../error-message";
import type { BudgetAlertRaisedEvent } from "../event-bus";
import { ALERT_RAISED_TOPIC } from "../event-bus";
import type { BlockedUsageEvent } from "../metering/usage-event";
import type { Budget, Decision } from "./budget";
import type { BudgetRepository } from "./budget.repository";
import type { BudgetTrigger, EvaluateBudgetOptions } from "./evaluate-budget";
import { evaluateBudget } from "./evaluate-budget";
import { defaultPeriodResolver, type PeriodResolver } from "./period";
import type { SpendAggregator } from "./spend-aggregator";
import { spendKey } from "./spend-snapshot";

/**
 * Fire-and-forget writer that stamps a `status='blocked'` row into
 * `usage_events` when a block trip fires. Failure must never bubble into
 * the SDK preflight path - the use case awaits `void promise.catch(log)`,
 * not the promise itself.
 */
export type RecordBlockedCall = (row: BlockedUsageEvent) => Promise<void>;

export interface DecideBudgetInput {
    readonly workspaceId: string;
    readonly tenantId: string | null;
    readonly agentId: string | null;
    readonly workflowId: string | null;
    /** SDK-declared target of the imminent call. Surfaced on blocked rows. */
    readonly intendedProvider?: string | null;
    readonly intendedModel?: string | null;
    readonly now: Date;
    readonly budgets: BudgetRepository;
    readonly spend: SpendAggregator;
    readonly ttlSeconds?: number;
    readonly recordBlocked?: RecordBlockedCall;
    readonly periodResolver?: PeriodResolver;
}

/**
 * Event shape that the dispatcher accepts: a `BudgetAlertRaisedEvent` with
 * its topic stamped so the EventDispatcher seam can route it.
 */
export type BudgetAlertRaisedDispatchEvent = BudgetAlertRaisedEvent & {
    readonly topic: typeof ALERT_RAISED_TOPIC;
};

/**
 * Side-effect packet the use case hands back when a budget crosses its cap.
 * The caller persists `crossing` via the alert repository; on inserted=true
 * it calls `buildEvent(alertId)` to materialize the publishable event.
 */
export interface BudgetCrossingTrigger {
    readonly crossing: BudgetCrossingRecord;
    readonly buildEvent: (alertId: string) => BudgetAlertRaisedDispatchEvent;
}

export interface DecideBudgetResult {
    readonly decision: Decision;
    readonly trigger?: BudgetCrossingTrigger;
}

export async function decideBudgetUseCase(input: DecideBudgetInput): Promise<DecideBudgetResult> {
    const raw = await input.budgets.findApplicable({
        workspaceId: input.workspaceId,
        tenantId: input.tenantId,
        agentId: input.agentId,
        workflowId: input.workflowId,
    });

    if (raw.length === 0) {
        return { decision: evaluateBudget({ get: () => 0 }, [], evalOpts(input)).decision };
    }

    const resolver = input.periodResolver ?? defaultPeriodResolver;
    const windows = raw.map((row) => ({
        row,
        window: resolver.resolveWindow(row.period, input.now),
    }));

    // Read-only decision: nothing mutates spend here, so the spend read +
    // evaluation needs no lock. Real cost lands on a separate report-usage
    // request that never takes a lock; serializing this preflight path bought
    // latency without preventing overshoot.
    const spends = await Promise.all(
        windows.map(({ row, window }) =>
            input.spend.getSpendForScopePeriod({
                workspaceId: input.workspaceId,
                scopeType: row.scopeType,
                scopeId: row.scopeId,
                from: window.from,
                to: window.to,
            }),
        ),
    );

    const resolved: Budget[] = [];
    const spendMap = new Map<string, number>();
    windows.forEach(({ row, window }, i) => {
        const used = spends[i];
        if (used === undefined) {
            throw new Error("invariant: spends length must match windows length");
        }
        spendMap.set(spendKey(row.scopeType, row.scopeId, window.from), used);
        resolved.push({ ...row, periodFrom: window.from, periodTo: window.to });
    });

    const snapshot = { get: (key: string) => spendMap.get(key) ?? 0 };
    const evalOutcome = evaluateBudget(snapshot, resolved, evalOpts(input));

    if (evalOutcome.trigger === undefined) {
        return { decision: evalOutcome.decision };
    }

    const trigger = evalOutcome.trigger;
    const triggerBudget = resolved.find((b) => b.id === trigger.budgetId);
    if (triggerBudget === undefined) {
        throw new Error("invariant: trigger budget id must exist in resolved budgets");
    }

    if (trigger.mode === "block" && input.recordBlocked !== undefined) {
        // Fire-and-forget: blocked-row write must not delay SDK response.
        void input
            .recordBlocked({
                workspaceId: input.workspaceId,
                tenantId: input.tenantId,
                agentId: input.agentId,
                workflowId: input.workflowId,
                ts: input.now,
                budgetId: trigger.budgetId,
                intendedProvider: input.intendedProvider ?? null,
                intendedModel: input.intendedModel ?? null,
                blockReason: evalOutcome.decision.reason,
            })
            .catch((err) => {
                console.warn("blocked_call.record_failed", {
                    workspaceId: input.workspaceId,
                    budgetId: trigger.budgetId,
                    error: errMessage(err),
                });
            });
    }

    return {
        decision: evalOutcome.decision,
        trigger: buildTrigger(input, trigger, triggerBudget, evalOutcome.decision.reason),
    };
}

function buildTrigger(
    input: DecideBudgetInput,
    trigger: BudgetTrigger,
    budget: Budget,
    reason: string,
): BudgetCrossingTrigger {
    const pctOver = computePctOver(trigger.used, trigger.limit);
    const severity = trigger.mode === "block" ? "critical" : "warning";

    const crossing: BudgetCrossingRecord = {
        workspaceId: input.workspaceId,
        budgetId: trigger.budgetId,
        periodFrom: trigger.periodFrom,
        pctOver,
        severity,
        payload: {
            reason,
            scopeType: trigger.scopeType,
            scopeId: trigger.scopeId,
            period: budget.period,
            mode: trigger.mode,
            used: trigger.used,
            limit: trigger.limit,
        },
        raisedAt: input.now,
    };

    return {
        crossing,
        buildEvent: (alertId: string) => ({
            topic: ALERT_RAISED_TOPIC,
            kind: "budget",
            alertId,
            workspaceId: input.workspaceId,
            budgetId: trigger.budgetId,
            scopeType: trigger.scopeType,
            scopeId: trigger.scopeId,
            period: budget.period,
            periodFrom: trigger.periodFrom,
            mode: trigger.mode,
            used: trigger.used,
            limit: trigger.limit,
            pctOver,
            severity,
            raisedAt: input.now,
        }),
    };
}

function computePctOver(used: number, limit: number): number {
    if (limit <= 0) return 0;
    return ((used - limit) / limit) * 100;
}

function evalOpts(input: DecideBudgetInput): EvaluateBudgetOptions {
    return input.ttlSeconds === undefined ? {} : { ttlSeconds: input.ttlSeconds };
}
