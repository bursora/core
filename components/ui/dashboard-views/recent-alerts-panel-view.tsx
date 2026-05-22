/**
 * RecentAlertsPanelView — pure presentational view for the Recent alerts feed.
 * Accepts already-shaped rows and an optional "View all" link target. No data
 * loading, no server-only imports; safe to render from any context.
 */

import type { Route } from "next";
import Link from "next/link";
import { Button } from "../button";
import { FeedItem } from "../feed-item";
import { DashboardSection } from "../workspace/dashboard-section";

export interface RecentAlertsRow {
    readonly key: string;
    readonly timestamp: string;
    readonly kind: "block" | "warn";
    readonly who: string;
    readonly label: string;
}

interface RecentAlertsPanelViewProps {
    readonly rows: readonly RecentAlertsRow[];
    readonly viewAllHref: Route | null;
}

export function RecentAlertsPanelView({ rows, viewAllHref }: RecentAlertsPanelViewProps) {
    const actions =
        viewAllHref === null ? undefined : (
            <Button asChild variant="link" size="sm" className="h-auto p-0">
                <Link href={viewAllHref}>View all →</Link>
            </Button>
        );

    return (
        <DashboardSection label="Recent alerts" sublabel="last 24h" actions={actions}>
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No alerts in the last 24 hours — agents behaving.
                </p>
            ) : (
                <div>
                    {rows.map((r) => (
                        <FeedItem key={r.key} timestamp={r.timestamp} kind={r.kind} who={r.who}>
                            {r.label}
                        </FeedItem>
                    ))}
                </div>
            )}
        </DashboardSection>
    );
}
