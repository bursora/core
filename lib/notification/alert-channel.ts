/**
 * Alert channel value object.
 *
 * Discriminated union on `kind`:
 *   - slack/discord: webhook URL
 *   - email: recipient address
 *
 * Channel rows live as JSON inside `alert_rules.channels`. The dispatcher
 * reads them per workspace + rule kind and routes by channel kind to the
 * appropriate sender (HTTP webhook vs SMTP mailer).
 */

export type AlertChannelKind = "slack" | "discord" | "email";

export interface SlackChannel {
    readonly kind: "slack";
    readonly url: string;
}

export interface DiscordChannel {
    readonly kind: "discord";
    readonly url: string;
}

export interface EmailChannel {
    readonly kind: "email";
    readonly address: string;
}

export type AlertChannel = SlackChannel | DiscordChannel | EmailChannel;

export type WebhookAlertChannel = SlackChannel | DiscordChannel;
