/**
 * Budget-trip attribution formatter.
 *
 * Renders the trip context into a single-line human string used by the bell
 * body, Slack/Discord webhook body, and email body. Shape:
 *
 *   "Budget exceeded - <scope> burned $<used> of $<limit>/<period-suffix> cap"
 *
 * When `deniedSinceTrip` is positive, the line is suffixed with
 * "; N call(s) denied since trip" so downstream surfaces see the running
 * count of blocked SDK preflights without re-querying.
 *
 * Hyphens only - never em dashes (voice rule).
 */

import type { BudgetAlertRaisedEvent } from "../event-bus";
import { formatUsd } from "../format";

const PERIOD_SUFFIX: Record<BudgetAlertRaisedEvent["period"], string> = {
    daily: "day",
    weekly: "wk",
    monthly: "mo",
};

export function formatBudgetAttribution(
    event: BudgetAlertRaisedEvent,
    deniedSinceTrip = 0,
): string {
    const scope = `${event.scopeType}:${event.scopeId ?? "*"}`;
    const used = formatUsd(event.used);
    const limit = formatUsd(event.limit);
    const suffix = PERIOD_SUFFIX[event.period];
    const base = `Budget exceeded - ${scope} burned ${used} of ${limit}/${suffix} cap`;
    if (deniedSinceTrip <= 0) return base;
    const noun = deniedSinceTrip === 1 ? "call" : "calls";
    return `${base}; ${deniedSinceTrip} ${noun} denied since trip`;
}
