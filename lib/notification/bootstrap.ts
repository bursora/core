/**
 * Notification bootstrap.
 *
 * Subscribes the dispatch-alert handler to the in-process event bus so any
 * `alert.raised` event is fanned out to the workspace's configured Slack,
 * Discord, and email channels. Idempotent — safe to call from multiple
 * callers.
 *
 * Wires the handler factory with the adapter singletons and registers the
 * result on the shared event bus. Does not run at module load — call
 * `ensureNotificationBootstrap` explicitly.
 */

import "server-only";

import { db } from "@/lib/db";
import { countBlockedSinceTrip } from "../budgeting/blocked-calls";
import { ALERT_RAISED_TOPIC, type AlertRaisedEvent } from "../event-bus";
import { DrizzleMemberRepository } from "../identity/drizzle-member.repository";
import { eventBus } from "../in-memory-event-bus";
import { dispatchAlertHandler } from "./dispatch-alert.handler";
import { drizzleAlertChannelRepository } from "./drizzle-alert-channel.repository";
import { defaultSmtpMailer } from "./send";
import { httpWebhookSender } from "./webhook-sender.adapter";
import { fanOutAlertNotification } from "../notifications/fan-out-alert";
import { drizzleNotificationDeliveriesRepository } from "../notifications/notification-deliveries.repository";
import { drizzleNotificationsRepository } from "../notifications/notifications.repository";

let bootstrapped = false;

export function ensureNotificationBootstrap(): void {
    if (bootstrapped) return;
    bootstrapped = true;

    const dispatch = dispatchAlertHandler({
        channels: drizzleAlertChannelRepository(db()),
        sender: httpWebhookSender,
        mailer: defaultSmtpMailer(),
        deliveries: drizzleNotificationDeliveriesRepository(db()),
    });

    const notifications = drizzleNotificationsRepository(db());
    const members = new DrizzleMemberRepository(db());

    // Single subscriber: read the denied-since-trip count once per budget
    // event, then fan out to both the channel dispatch and the per-member
    // notifications insert. Avoids the double DB hit per alert.
    eventBus().subscribe<AlertRaisedEvent>(ALERT_RAISED_TOPIC, async (event) => {
        const deniedSinceTrip =
            event.kind === "budget"
                ? await countBlockedSinceTrip({
                      db: db(),
                      workspaceId: event.workspaceId,
                      since: event.raisedAt,
                  }).catch(() => 0)
                : 0;
        await Promise.all([
            dispatch(event, { deniedSinceTrip }),
            fanOutAlertNotification({
                event,
                notifications,
                listMemberUserIds: (workspaceId) => members.listMemberUserIds(workspaceId),
                deniedSinceTrip,
            }),
        ]);
    });
}

/**
 * Test-only escape hatch: lets a test reset the bootstrap flag so it can
 * re-register handlers under a fresh fake bus.
 */
export function resetNotificationBootstrapForTesting(): void {
    bootstrapped = false;
}
