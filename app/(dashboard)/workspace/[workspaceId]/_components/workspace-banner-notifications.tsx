/**
 * Workspace-wide banner strip. Reads notifications tagged
 * `display='banner' AND read_at IS NULL` for the current user+workspace and
 * renders one `DismissibleBanner` per row. Dismiss marks the notification
 * read so the banner stays gone until a new crossing fires a fresh row.
 *
 * Replaces the per-domain banners (budget block, anomaly, setup error) with
 * one notifications-driven surface. Writers tag rows at fan-out time via
 * `InsertNotificationInput.display`; no recomputation here.
 *
 * Exception: `source='setup_error'` notifications are written once at the
 * 0→1 bucket crossing with a `{count}` placeholder in `body`. The live 24h
 * bucket count is substituted here so the banner reflects current state.
 */

import { formatCount } from "@/lib/format";
import { COUNT_PLACEHOLDER } from "@/lib/notices/labels";
import {
    listNotifications,
    type NotificationItem,
    type NotificationSource,
} from "@/lib/notifications";
import { DASHBOARD_WINDOW_MS } from "@/lib/setup-errors/category";
import { parseSetupErrorDedupKey, summarizeSetupErrorsSince } from "@/lib/setup-errors/server";
import { Activity, ShieldBan } from "lucide-react";
import type { Route } from "next";
import type { ReactNode } from "react";
import { DismissibleBanner } from "./dismissible-banner";

interface WorkspaceBannerNotificationsProps {
    readonly workspaceId: string;
    readonly userId: string;
}

const ICON_BY_SOURCE: Record<NotificationSource, ReactNode> = {
    alert: <Activity />,
    setup_error: <ShieldBan />,
};

export async function WorkspaceBannerNotifications({
    workspaceId,
    userId,
}: WorkspaceBannerNotificationsProps) {
    const items = await listNotifications({
        userId,
        workspaceId,
        display: "banner",
    });
    if (items.length === 0) return null;

    const setupErrorSummary = items.some((i) => i.source === "setup_error")
        ? await summarizeSetupErrorsSince(workspaceId, DASHBOARD_WINDOW_MS)
        : null;

    return (
        <div className="mb-4 flex flex-col gap-2">
            {items.map((item) => (
                <DismissibleBanner
                    key={item.id}
                    notificationId={item.id}
                    href={safeHref(item.href)}
                    message={`${item.title} - ${resolveBody(item, setupErrorSummary)}`}
                    variant={item.severity === "critical" ? "destructive" : "warning"}
                    icon={ICON_BY_SOURCE[item.source]}
                    dismissAriaLabel={`Dismiss ${item.title}`}
                />
            ))}
        </div>
    );
}

function resolveBody(
    item: NotificationItem,
    setupErrorSummary: ReadonlyMap<string, { count: number }> | null,
): string {
    if (item.source !== "setup_error" || setupErrorSummary === null) return item.body;
    if (!item.body.includes(COUNT_PLACEHOLDER)) return item.body;
    const category = parseSetupErrorDedupKey(item.dedupKey);
    if (category === null) return item.body;
    // Fall back to 1 if the summary lost the row between insert and read —
    // the banner only exists because at least one error crossed 0→1.
    const count = setupErrorSummary.get(category)?.count ?? 1;
    return item.body.replaceAll(COUNT_PLACEHOLDER, formatCount(count));
}

// Defense in depth: writers build `href` server-side, but the column is
// `text`. Reject anything that isn't a same-origin path so a stray writer
// can't surface `javascript:` or off-site URLs through a `<Link>` target.
function safeHref(href: string | null): Route {
    if (href === null || !href.startsWith("/") || href.startsWith("//")) {
        return "/" as Route;
    }
    return href as Route;
}
