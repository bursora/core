/**
 * SeveritySign — colored dot + accessible label for an alert severity.
 *
 * Light, presentational. No client hooks.
 */

import type { AlertSeverity } from "@/lib/severity";
import { SEVERITY_BG, SEVERITY_TEXT } from "@/lib/severity";
import { cn } from "@/lib/utils";

interface SeveritySignProps {
    severity: AlertSeverity;
    showLabel?: boolean;
    className?: string;
}

export function SeveritySign({ severity, showLabel = false, className }: SeveritySignProps) {
    return (
        <span
            className={cn("inline-flex items-center gap-2", className)}
            aria-label={`Severity: ${severity}`}
        >
            <span
                aria-hidden="true"
                className={cn("size-2.5 rounded-full", SEVERITY_BG[severity])}
            />
            {showLabel ? (
                <span className={cn("text-xs font-medium capitalize", SEVERITY_TEXT[severity])}>
                    {severity}
                </span>
            ) : null}
        </span>
    );
}
