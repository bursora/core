import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ServiceHealth } from "@/lib/system-health";
import type { ReactNode } from "react";
import { StatusBadge } from "./status-badge";

interface ServiceCardProps {
    service: ServiceHealth;
    /** Optional footer action (e.g. the SMTP / Sentry test button). */
    children?: ReactNode;
}

export function ServiceCard({ service, children }: ServiceCardProps) {
    const hasMeta = typeof service.latencyMs === "number" || service.error !== undefined;
    return (
        <Card
            className={
                service.status === "down" ? "ring-1 ring-red-300 dark:ring-red-900/50" : undefined
            }
        >
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <div className="space-y-1">
                    <CardTitle className="text-base">{service.label}</CardTitle>
                    {service.detail ? (
                        <p className="text-xs text-muted-foreground">{service.detail}</p>
                    ) : null}
                </div>
                <StatusBadge status={service.status} />
            </CardHeader>
            {hasMeta || children ? (
                <CardContent className="space-y-3">
                    {hasMeta ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            {typeof service.latencyMs === "number" ? (
                                <span className="tabular-nums text-muted-foreground">
                                    {service.latencyMs} ms
                                </span>
                            ) : null}
                            {service.error ? (
                                <span className="font-medium text-red-600 dark:text-red-400">
                                    {service.error}
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                    {children}
                </CardContent>
            ) : null}
        </Card>
    );
}
