/**
 * Public API of the notification feature.
 *
 * Consumers in `app/`, `lib/auth.ts`, and other features import the Mailer
 * port, the `defaultSmtpMailer()` factory (process-wide singleton), the
 * in-memory test substitute, and the outbound-email helpers from here.
 * Webhook alert dispatch (Slack/Discord) is also surfaced through this
 * module.
 */

export { formatBudgetAttribution } from "./budget-attribution";
export type { AlertChannelsInput } from "./save-alert-channels.usecase";
export * from "./send";
