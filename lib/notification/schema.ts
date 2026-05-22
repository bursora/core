/**
 * Notification tables.
 *
 * `alert_rules` carries the workspace's configured outbound channels
 * (slack/discord webhooks) consumed by the alert dispatcher.
 *
 * Re-exported from the canonical declarations in `drizzle/schema.ts` during
 * the multi-feature migration. The cleanup slice physically relocates the
 * declarations here.
 */
export { alertRules } from "@/lib/db";
