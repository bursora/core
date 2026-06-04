/**
 * Notification bootstrap.
 *
 * Wires alert handlers onto the `EventDispatcher` seam so every
 * `alert.raised` event reaches the channel dispatcher and the per-member
 * notification fan-out. Bridges the legacy in-process event bus into the
 * dispatcher so existing publishers (decide-budget, anomaly-detection) keep
 * working untouched. Idempotent — safe to call from multiple callers.
 *
 * The bus subscriber reads the denied-since-trip count once per event and
 * augments the dispatched event so both handlers share that work instead of
 * double-querying.
 */

import "server-only";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db";
import { countBlockedSinceTrip } from "../budgeting/blocked-calls";
import { ALERT_RAISED_TOPIC, type AlertRaisedEvent } from "../event-bus";
import { DrizzleMemberRepository } from "../identity/drizzle-member.repository";
import { eventBus } from "../in-memory-event-bus";
import { createEventDispatcher, type EventDispatcher } from "../notifications/event-dispatcher";
import { fanOutAlertNotification } from "../notifications/fan-out-alert";
import { drizzleNotificationDeliveriesRepository } from "../notifications/notification-deliveries.repository";
import { drizzleNotificationsRepository } from "../notifications/notifications.repository";
import { dispatchAlertHandler } from "./dispatch-alert.handler";
import { drizzleAlertChannelRepository } from "./drizzle-alert-channel.repository";
import { defaultSmtpMailer } from "./send";
import { httpWebhookSender } from "./webhook-sender.adapter";

type AlertRaisedDispatchEvent = AlertRaisedEvent & {
    readonly topic: typeof ALERT_RAISED_TOPIC;
    readonly deniedSinceTrip: number;
};

let bootstrapped = false;
let dispatcher: EventDispatcher | null = null;

export function ensureNotificationBootstrap(): void {
    if (bootstrapped) return;
    bootstrapped = true;

    dispatcher = createEventDispatcher();

    const dispatch = dispatchAlertHandler({
        channels: drizzleAlertChannelRepository(db()),
        sender: httpWebhookSender,
        mailer: defaultSmtpMailer(),
        deliveries: drizzleNotificationDeliveriesRepository(db()),
    });

    const notifications = drizzleNotificationsRepository(db());
    const members = new DrizzleMemberRepository(db());

    dispatcher.on<AlertRaisedDispatchEvent>(ALERT_RAISED_TOPIC, async (event) => {
        await dispatch(event, { deniedSinceTrip: event.deniedSinceTrip });
    });
    dispatcher.on<AlertRaisedDispatchEvent>(ALERT_RAISED_TOPIC, async (event) => {
        await fanOutAlertNotification({
            event,
            notifications,
            listMemberUserIds: (workspaceId) => members.listMemberUserIds(workspaceId),
            deniedSinceTrip: event.deniedSinceTrip,
        });
    });

    // Bridge: legacy publishers still call `bus.publish(ALERT_RAISED_TOPIC, ...)`.
    // Read denied-since-trip once per event, then dispatch the augmented event
    // so both handlers share that work instead of double-querying.
    eventBus().subscribe<AlertRaisedEvent>(ALERT_RAISED_TOPIC, async (event) => {
        const deniedSinceTrip =
            event.kind === "budget"
                ? await countBlockedSinceTrip({
                      ch: clickhouseClient(),
                      workspaceId: event.workspaceId,
                      since: event.raisedAt,
                  }).catch(() => 0)
                : 0;
        await dispatcher?.dispatch<AlertRaisedDispatchEvent>({
            ...event,
            topic: ALERT_RAISED_TOPIC,
            deniedSinceTrip,
        });
    });
}
