/**
 * Alert→notification fan-out. Subscribed to `alert.raised`; inserts one row
 * per workspace member into `notifications`, keyed by `alert:{alertId}` (the
 * unique index already scopes the key per user).
 */

import type { AlertRaisedEvent, BudgetAlertRaisedEvent } from "../event-bus";
import { formatWindowLine } from "../format";
import { formatBudgetAttribution } from "../notification/budget-attribution";
import { buildWorkspacePath } from "../routes";
import type { Route } from "next";
import type { NotificationsRepository } from "./notifications.repository";

const OUTCOME_SUFFIX: Record<BudgetAlertRaisedEvent["mode"], string | null> = {
    block: "calls blocked",
    throttle: "calls throttled",
    notify: null,
};

export interface FanOutAlertInput {
    readonly event: AlertRaisedEvent;
    readonly notifications: NotificationsRepository;
    readonly listMemberUserIds: (workspaceId: string) => Promise<readonly string[]>;
    readonly deniedSinceTrip?: number;
}

export async function fanOutAlertNotification(input: FanOutAlertInput): Promise<void> {
    const { event, notifications, listMemberUserIds, deniedSinceTrip = 0 } = input;
    const userIds = await listMemberUserIds(event.workspaceId);
    if (userIds.length === 0) return;

    const { title, body } = render(event, deniedSinceTrip);
    const href: Route =
        event.kind === "budget"
            ? (`${buildWorkspacePath(event.workspaceId, "budgets")}#budget-${event.budgetId}` as Route)
            : buildWorkspacePath(event.workspaceId, "alerts");

    await notifications.insertIgnore(
        userIds.map((userId) => ({
            workspaceId: event.workspaceId,
            userId,
            source: "alert",
            dedupKey: `alert:${event.alertId}`,
            severity: event.severity,
            title,
            body,
            href,
            display: "banner",
        })),
    );
}

function render(
    event: AlertRaisedEvent,
    deniedSinceTrip: number,
): { readonly title: string; readonly body: string } {
    if (event.kind === "anomaly") {
        return {
            title: "Anomaly detected",
            body: `${event.reason} ${formatWindowLine(event)}`,
        };
    }
    const attribution = formatBudgetAttribution(event, deniedSinceTrip);
    const outcome = OUTCOME_SUFFIX[event.mode];
    return {
        title: "Budget exceeded",
        body: outcome === null ? `${attribution}.` : `${attribution} - ${outcome}.`,
    };
}
