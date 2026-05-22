/**
 * Budget aggregate + Decision value object for the budgeting context.
 *
 * A `Budget` row is the persisted shape from the `budgets` table, augmented
 * with the resolved `periodFrom` boundary that the spend-aggregator uses to
 * key the spend lookup. The `period` string column is mapped to the
 * `Period` literal union before the row reaches the domain.
 *
 * `Decision` is the SDK contract: { allow, mode, reason, ttl_s }. The SDK
 * caches it for `ttl_s` seconds; on `!allow && mode === 'block'` the SDK
 * throws `BudgetExceededError` before the provider call.
 */

import type { Period } from "./period";

export const MODES = ["notify", "throttle", "block"] as const;
export const SCOPE_TYPES = ["workspace", "tenant", "agent", "workflow"] as const;

export type BudgetMode = (typeof MODES)[number];

export type ScopeType = (typeof SCOPE_TYPES)[number];

export interface Budget {
    readonly id: string;
    readonly workspaceId: string;
    readonly scopeType: ScopeType;
    readonly scopeId: string | null;
    readonly period: Period;
    readonly amountUsd: string;
    readonly mode: BudgetMode;
    readonly periodFrom: Date;
    readonly periodTo: Date;
}

/**
 * SDK-facing decision shape.
 *
 * `remainingUsd` and `resetAt` give the SDK a read-only snapshot of how much
 * budget is left and when it resets, so customer apps can self-degrade before
 * any block fires. They reflect the strictest under-cap budget (or the winning
 * trip row on the over-cap path). `remainingUsd` is `max(0, limit - used)` —
 * never negative. `resetAt` is the period window's `to` boundary as ISO 8601
 * UTC.
 *
 * No-budgets sentinel: `remainingUsd: 0`, `resetAt: ""` (empty string). Callers
 * read the empty string as "no period to display" and skip the snapshot.
 */
export interface Decision {
    readonly allow: boolean;
    readonly mode: BudgetMode;
    readonly reason: string;
    readonly ttl_s: number;
    readonly remainingUsd: number;
    readonly resetAt: string;
}
