/**
 * Shared severity tokens and alert discriminators.
 *
 * Single source for severity → tailwind utility class. Both the alerts
 * SeveritySign and the activity drawer consume these maps so warning/critical
 * colors stay aligned.
 *
 * `AlertSeverity` is the alert subset (no `info`). `AlertKind` discriminates
 * anomaly vs budget across the event bus, the persisted alert_rules table,
 * and channel routing.
 */

export type Severity = "info" | "warning" | "critical";

export type AlertSeverity = Exclude<Severity, "info">;

export type AlertKind = "anomaly" | "budget";

export const SEVERITY_BG: Record<Severity, string> = {
    info: "bg-transparent",
    warning: "bg-warning",
    critical: "bg-destructive",
};

export const SEVERITY_TEXT: Record<Severity, string> = {
    info: "text-muted-foreground",
    warning: "text-warning",
    critical: "text-destructive",
};
