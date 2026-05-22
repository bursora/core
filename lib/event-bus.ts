/**
 * In-process event bus port.
 *
 * Cross-context comms on the write side. Synchronous publication: handlers
 * run in the same tick as `publish`. A handler that throws MUST NOT crash
 * the publisher — implementations log and swallow.
 *
 * `AlertRaisedEvent` is a discriminated union on `kind`:
 *   - `anomaly`: detector-emitted z-score crossings (scope = workspace/tenant/agent)
 *   - `budget`:  budget-exceeded crossings (scope = budget id + period boundary)
 *
 * One topic (`alert.raised`) covers both; subscribers branch on `kind`.
 */

export interface EventBus {
    publish<E>(topic: string, event: E): Promise<void>;
    subscribe<E>(topic: string, handler: (event: E) => Promise<void> | void): void;
}

import type { AlertSeverity } from "./severity";

export const ALERT_RAISED_TOPIC = "alert.raised";

export interface AnomalyAlertRaisedEvent {
    readonly kind: "anomaly";
    /** Stable UUID assigned by the producer, used by notification fan-out for dedup. */
    readonly alertId: string;
    readonly workspaceId: string;
    readonly tenantId: string | null;
    readonly agentId: string | null;
    readonly reason: string;
    readonly deviation: number;
    readonly severity: AlertSeverity;
    readonly raisedAt: Date;
    /** Start of the 5-minute bucket whose aggregate spend triggered the alert. */
    readonly windowStart: Date;
    /** End of the 5-minute bucket (exclusive); always `windowStart + 5 min`. */
    readonly windowEnd: Date;
    /** Aggregate spend inside the bucket; already summed by the spend-series source. */
    readonly windowCostUsd: number;
}

export interface BudgetAlertRaisedEvent {
    readonly kind: "budget";
    /** Stable UUID assigned by the producer, used by notification fan-out for dedup. */
    readonly alertId: string;
    readonly workspaceId: string;
    readonly budgetId: string;
    readonly scopeType: "workspace" | "tenant" | "agent" | "workflow";
    readonly scopeId: string | null;
    readonly period: "daily" | "weekly" | "monthly";
    readonly periodFrom: Date;
    readonly mode: "block" | "throttle" | "notify";
    readonly used: number;
    readonly limit: number;
    readonly pctOver: number;
    readonly severity: AlertSeverity;
    readonly raisedAt: Date;
}

export type AlertRaisedEvent = AnomalyAlertRaisedEvent | BudgetAlertRaisedEvent;
