/**
 * Webhook sender port.
 *
 * Abstracts the actual HTTP POST so tests can capture calls without
 * touching the network. One infrastructure adapter
 * (`httpWebhookSender` in `webhook-sender.adapter.ts`) is shared by Slack
 * and Discord. The channel-specific JSON shape is decided upstream by
 * the payload renderer, so the sender stays agnostic.
 */

export interface WebhookSender {
    post(url: string, body: unknown): Promise<void>;
}
