/**
 * decideBudget — orchestrator for the budget decision read path.
 *
 *   1. Load every budget row that applies to the request scope (workspace +
 *      optional tenant/agent/workflow) via the BudgetRepository.
 *   2. For each row, compute the period window in UTC.
 *   3. Query the SpendAggregator port for the spend in that scope+window.
 *   4. Build a Spend snapshot and run the pure `evaluateBudget` deep module.
 *   5. When the evaluator surfaces a winning over-budget trigger, record
 *      the crossing (idempotent per workspace+budget+period). If the row
 *      was inserted (first crossing in this window), publish a
 *      `BudgetAlertRaisedEvent` so the notification dispatcher fans out
 *      to the workspace's channels.
 *
 * The orchestrator stays thin — all enforcement policy lives in
 * `evaluateBudget`. Period math lives in `period.ts`.
 *
 * `bus` and `alerts` are optional so the use case keeps working in
 * unit/feature tests that exercise the decision path in isolation.
 */

import type { AlertRepository } from "../detection/alert.repository";
import { errMessage } from "../error-message";
import { ALERT_RAISED_TOPIC, type BudgetAlertRaisedEvent, type EventBus } from "../event-bus";
import type { Budget, Decision } from "./budget";
import type { BudgetRepository } from "./budget.repository";
import type { BudgetTrigger, EvaluateBudgetOptions } from "./evaluate-budget";
import { evaluateBudget } from "./evaluate-budget";
import { periodWindow } from "./period";
import type { SpendAggregator } from "./spend-aggregator";
import { spendKey } from "./spend-snapshot";

/**
 * Fire-and-forget writer that stamps a `status='blocked'` row into
 * `usage_events` when a block trip fires. Failure must never bubble into
 * the SDK preflight path - the use case awaits `void promise.catch(log)`,
 * not the promise itself.
 */
export type RecordBlockedCall = (row: {
    readonly workspaceId: string;
    readonly tenantId: string | null;
    readonly agentId: string | null;
    readonly workflowId: string | null;
    readonly ts: Date;
    readonly budgetId: string;
    /** SDK-declared target of the blocked call. NULL when the SDK omitted them. */
    readonly intendedProvider: string | null;
    readonly intendedModel: string | null;
    /** Decision reason string from `evaluateBudget`. */
    readonly blockReason: string;
}) => Promise<void>;

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
    readonly bus?: EventBus;
    readonly alerts?: AlertRepository;
    readonly recordBlocked?: RecordBlockedCall;
}

export async function decideBudgetUseCase(input: DecideBudgetInput): Promise<Decision> {
    const raw = await input.budgets.findApplicable({
        workspaceId: input.workspaceId,
        tenantId: input.tenantId,
        agentId: input.agentId,
        workflowId: input.workflowId,
    });

    if (raw.length === 0) {
        return evaluateBudget({ get: () => 0 }, [], evalOpts(input)).decision;
    }

    const windows = raw.map((row) => ({
        row,
        window: periodWindow(row.period, input.now),
    }));
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
    const outcome = evaluateBudget(snapshot, resolved, evalOpts(input));

    if (outcome.trigger !== undefined) {
        const trigger = outcome.trigger;
        const triggerBudget = resolved.find((b) => b.id === trigger.budgetId);
        if (triggerBudget === undefined) {
            throw new Error("invariant: trigger budget id must exist in resolved budgets");
        }
        await handleCrossing(input, trigger, triggerBudget, outcome.decision.reason);
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
                    blockReason: outcome.decision.reason,
                })
                .catch((err) => {
                    console.warn("blocked_call.record_failed", {
                        workspaceId: input.workspaceId,
                        budgetId: trigger.budgetId,
                        error: errMessage(err),
                    });
                });
        }
    }

    return outcome.decision;
}

async function handleCrossing(
    input: DecideBudgetInput,
    trigger: BudgetTrigger,
    budget: Budget,
    reason: string,
): Promise<void> {
    if (input.alerts === undefined) return;

    const pctOver = computePctOver(trigger.used, trigger.limit);
    const severity = trigger.mode === "block" ? "critical" : "warning";

    const result = await input.alerts.recordBudgetCrossing({
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
    });

    if (!result.inserted || result.id === null || input.bus === undefined) return;

    const event: BudgetAlertRaisedEvent = {
        kind: "budget",
        alertId: result.id,
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
    };
    // Fire-and-forget: dispatch handler awaits webhook POSTs + SMTP, which
    // can take seconds. The SDK pre-call decision must not block on them.
    // Errors are swallowed by the in-process event bus, but a publish-time
    // failure (e.g. bus disposed) should still be logged.
    void input.bus.publish<BudgetAlertRaisedEvent>(ALERT_RAISED_TOPIC, event).catch((err) => {
        console.warn("budget_alert.publish_failed", {
            workspaceId: input.workspaceId,
            budgetId: trigger.budgetId,
            error: errMessage(err),
        });
    });
}

function computePctOver(used: number, limit: number): number {
    if (limit <= 0) return 0;
    return ((used - limit) / limit) * 100;
}

function evalOpts(input: DecideBudgetInput): EvaluateBudgetOptions {
    return input.ttlSeconds === undefined ? {} : { ttlSeconds: input.ttlSeconds };
}
