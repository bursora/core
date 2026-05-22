/**
 * Channel health value shape used by the dashboard status strip.
 *
 * One row per configured channel kind for a workspace. `lastAttemptAt` is
 * null when there are no `notification_deliveries` rows yet for the kind.
 * `recentFailureCount` is the count of `failed` rows in the last 24 hours.
 */

export type NotificationChannelKind = "slack" | "discord" | "email";

export type NotificationDeliveryStatus = "ok" | "failed";

export interface ChannelHealthRow {
    readonly kind: NotificationChannelKind;
    readonly lastAttemptAt: Date | null;
    readonly lastStatus: NotificationDeliveryStatus | null;
    readonly lastError: string | null;
    readonly recentFailureCount: number;
}
