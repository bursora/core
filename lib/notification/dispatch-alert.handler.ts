/**
 * dispatch-alert.handler: routes an alert event to Slack/Discord webhooks and
 * SMTP email. Every attempt is recorded in `notification_deliveries` for the
 * dashboard health strip; channel failures are logged and swallowed so the
 * other channels still receive the alert.
 */

import { errMessage } from "../error-message";
import type { AlertRaisedEvent } from "../event-bus";
import type { NotificationDeliveriesWriter } from "../notifications/notification-deliveries.repository";
import { recordNotificationDelivery } from "../notifications/record-notification-delivery";
import type { AlertChannel } from "./alert-channel";
import type { AlertChannelRepository } from "./alert-channel.repository";
import { sendAlertEmail, type Mailer } from "./send";
import { renderWebhookPayload, type RenderOptions } from "./webhook-payload";
import type { WebhookSender } from "./webhook-sender";

export interface DispatchAlertDeps {
    readonly channels: AlertChannelRepository;
    readonly sender: WebhookSender;
    readonly mailer: Mailer;
    readonly deliveries?: NotificationDeliveriesWriter;
}

export type DispatchAlertHandler = (
    event: AlertRaisedEvent,
    renderOptions?: RenderOptions,
) => Promise<void>;

export const dispatchAlertHandler =
    (deps: DispatchAlertDeps): DispatchAlertHandler =>
    async (event, renderOptions = {}) => {
        const channels = await deps.channels.listForRuleKind(event.workspaceId, event.kind);
        if (channels.length === 0) return;
        await Promise.all(
            channels.map((channel) => sendAndRecord({ deps, event, channel, renderOptions })),
        );
    };

interface DispatchAttempt {
    readonly deps: DispatchAlertDeps;
    readonly event: AlertRaisedEvent;
    readonly channel: AlertChannel;
    readonly renderOptions: RenderOptions;
}

async function sendAndRecord({
    deps,
    event,
    channel,
    renderOptions,
}: DispatchAttempt): Promise<void> {
    const startedAtMs = Date.now();
    let errorMessage: string | null = null;

    try {
        if (channel.kind === "email") {
            await sendAlertEmail({
                mailer: deps.mailer,
                email: channel.address,
                event,
                renderOptions,
            });
        } else {
            await deps.sender.post(
                channel.url,
                renderWebhookPayload(channel.kind, event, renderOptions),
            );
        }
    } catch (err) {
        errorMessage = errMessage(err);
        console.warn("notification.dispatch_failed", {
            workspaceId: event.workspaceId,
            channel: channel.kind,
            error: errorMessage,
        });
    }

    if (!deps.deliveries) return;
    const latencyMs = Date.now() - startedAtMs;
    const target = channel.kind === "email" ? channel.address : channel.url;
    try {
        await recordNotificationDelivery({
            writer: deps.deliveries,
            workspaceId: event.workspaceId,
            kind: channel.kind,
            target,
            status: errorMessage === null ? "ok" : "failed",
            error: errorMessage,
            latencyMs,
        });
    } catch (err) {
        // Recording must not break delivery; swallow and log.
        console.warn("notification.delivery_record_failed", {
            workspaceId: event.workspaceId,
            channel: channel.kind,
            error: errMessage(err),
        });
    }
}
