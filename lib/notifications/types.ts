import type { Severity } from "../severity";

export type NotificationSource = "alert" | "setup_error";

export type NotificationSeverity = Severity;

/**
 * `inline` (default): bell list only.
 * `banner`: bell list + workspace-wide banner strip in the dashboard shell.
 */
export type NotificationDisplay = "inline" | "banner";

export interface NotificationItem {
    readonly id: string;
    readonly workspaceName: string;
    readonly source: NotificationSource;
    readonly dedupKey: string;
    readonly severity: NotificationSeverity;
    readonly title: string;
    readonly body: string;
    readonly createdAt: string;
    readonly href: string | null;
    readonly read: boolean;
    readonly display: NotificationDisplay;
}
