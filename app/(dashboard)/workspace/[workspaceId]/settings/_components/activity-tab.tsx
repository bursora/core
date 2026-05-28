import { Button } from "@/components/ui/button";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { DateRangeFilter } from "@/components/ui/workspace/filters/date-range-filter";
import { StatusTag } from "@/components/ui/workspace/status-tag";
import { listActivityPage } from "@/lib/compose/activity";
import { formatRelativeTime } from "@/lib/format";
import {
    ACTIVITY_KIND_LABELS,
    deserializeActivityFilters,
    serializeActivityFilters,
    type ActivityFilters as ActivityFilterValues,
    type ActivityItem,
    type ActivityKind,
} from "@/lib/metering";
import { buildWorkspacePath } from "@/lib/routes";
import { SEVERITY_BG, SEVERITY_TEXT, type Severity } from "@/lib/severity";
import { cn } from "@/lib/utils";
import {
    Activity,
    AlertTriangle,
    ChevronRight,
    Key as KeyIcon,
    KeyRound,
    ShieldAlert,
    TrendingUp,
    type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { ActivityActiveFilters } from "./activity-active-filters";

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
    event_ingested: TrendingUp,
    alert_raised: AlertTriangle,
    key_issued: KeyIcon,
    key_revoked: KeyRound,
    setup_error: ShieldAlert,
};

export interface ActivityTabProps {
    readonly workspaceId: string;
    readonly searchParams: {
        readonly kind?: string;
        readonly severity?: string;
        readonly from?: string;
        readonly to?: string;
        readonly cursor?: string;
    };
}

const DEFAULT_ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function toSearchParams(input: ActivityTabProps["searchParams"]): URLSearchParams {
    const out = new URLSearchParams();
    if (input.kind !== undefined) out.set("kind", input.kind);
    if (input.severity !== undefined) out.set("severity", input.severity);
    if (input.from !== undefined) out.set("from", input.from);
    if (input.to !== undefined) out.set("to", input.to);
    if (input.cursor !== undefined) out.set("cursor", input.cursor);
    return out;
}

export async function ActivityTab({
    workspaceId,
    searchParams,
}: ActivityTabProps): Promise<React.JSX.Element> {
    const parsed = deserializeActivityFilters(toSearchParams(searchParams));
    const cursor = parsed.cursor ?? null;

    const now = new Date();
    const to = parsed.to ?? now;
    const from = parsed.from ?? new Date(to.getTime() - DEFAULT_ACTIVITY_WINDOW_MS);

    const filters: ActivityFilterValues = {
        from,
        ...(parsed.kind !== undefined ? { kind: parsed.kind } : {}),
        ...(parsed.severity !== undefined ? { severity: parsed.severity } : {}),
    };

    const page = await listActivityPage({ workspaceId, now, filters, cursor });
    const groups = groupByDay(page.items, now);

    return (
        <DashboardSection
            label="Activity log"
            sublabel="events · alerts · key changes"
            bodyClassName="-mx-5"
        >
            <div className="mb-3 flex flex-wrap items-center gap-2 px-5">
                <ActivityActiveFilters />
                <DateRangeFilter from={from} to={to} />
            </div>

            {groups.length === 0 ? (
                <EmptyState />
            ) : (
                <ul className="divide-y divide-border/60" aria-label="Activity items">
                    {groups.map((group) => (
                        <li key={group.key}>
                            <DayHeader label={group.label} />
                            <ul className="divide-y divide-border/40">
                                {group.items.map((item, idx) => (
                                    <ActivityRow
                                        key={`${item.at.toISOString()}-${idx}`}
                                        item={item}
                                        workspaceId={workspaceId}
                                    />
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            )}

            {page.nextCursor !== null ? (
                <LoadMore
                    workspaceId={workspaceId}
                    searchParams={searchParams}
                    cursor={page.nextCursor}
                />
            ) : null}
        </DashboardSection>
    );
}

interface DayGroup {
    readonly key: string;
    readonly label: string;
    readonly items: readonly ActivityItem[];
}

function groupByDay(items: readonly ActivityItem[], now: Date): readonly DayGroup[] {
    const dayMs = 24 * 60 * 60 * 1000;
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();

    const bucket = new Map<string, ActivityItem[]>();
    for (const item of items) {
        const d = new Date(item.at);
        d.setHours(0, 0, 0, 0);
        const key = d.toISOString();
        const list = bucket.get(key);
        if (list) list.push(item);
        else bucket.set(key, [item]);
    }

    return [...bucket.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([key, list]) => {
            const day = new Date(key);
            const diff = todayMs - day.getTime();
            let label: string;
            if (diff === 0) label = "Today";
            else if (diff === dayMs) label = "Yesterday";
            else
                label = day.toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                });
            return { key, label, items: list };
        });
}

interface DayHeaderProps {
    readonly label: string;
}

function DayHeader({ label }: DayHeaderProps): React.JSX.Element {
    return (
        <div className="sticky top-0 z-10 border-b bg-background/95 px-5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 backdrop-blur">
            {label}
        </div>
    );
}

interface ActivityRowProps {
    readonly item: ActivityItem;
    readonly workspaceId: string;
}

function rowHref(workspaceId: string, kind: ActivityKind): Route | null {
    if (kind === "alert_raised") return buildWorkspacePath(workspaceId, "alerts");
    if (kind === "key_issued" || kind === "key_revoked") {
        return buildWorkspacePath(workspaceId, "keys");
    }
    return null;
}

function ActivityRow({ item, workspaceId }: ActivityRowProps): React.JSX.Element {
    const severity: Severity = item.severity ?? "info";
    const href = rowHref(workspaceId, item.kind);
    const Icon = KIND_ICON[item.kind];
    const isAlert = severity !== "info";

    const body = (
        <div className="relative grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-2.5">
            {isAlert ? (
                <span
                    aria-hidden="true"
                    className={cn(
                        "absolute inset-y-2 left-0 w-[2px] rounded-r-full",
                        SEVERITY_BG[severity],
                    )}
                />
            ) : null}

            <span
                className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md border bg-card",
                    SEVERITY_TEXT[severity],
                )}
            >
                <Icon aria-hidden="true" className="size-3.5" />
            </span>

            <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm">
                    <span className="font-medium text-foreground">
                        {ACTIVITY_KIND_LABELS[item.kind]}
                    </span>
                    <span className="text-muted-foreground"> · {item.summary}</span>
                </span>
                {item.scope ? (
                    <StatusTag tone="muted" variant="pill">
                        {item.scope}
                    </StatusTag>
                ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
                <time
                    dateTime={item.at.toISOString()}
                    className="tabular-nums text-xs text-muted-foreground"
                >
                    {formatRelativeTime(item.at)}
                </time>
                {href !== null ? (
                    <ChevronRight
                        aria-hidden="true"
                        className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    />
                ) : null}
            </div>
        </div>
    );

    if (href !== null) {
        return (
            <li>
                <Link
                    href={href}
                    className="group block transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                    {body}
                </Link>
            </li>
        );
    }

    return <li>{body}</li>;
}

function EmptyState(): React.JSX.Element {
    return (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <div className="grid size-10 place-items-center rounded-full border bg-muted/40">
                <Activity aria-hidden="true" className="size-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No activity in this range</p>
            <p className="text-xs text-muted-foreground">
                Try widening the range or clearing filters.
            </p>
        </div>
    );
}

interface LoadMoreProps {
    readonly workspaceId: string;
    readonly searchParams: ActivityTabProps["searchParams"];
    readonly cursor: string;
}

function LoadMore({ workspaceId, searchParams, cursor }: LoadMoreProps): React.JSX.Element {
    const filterParams = deserializeActivityFilters(toSearchParams(searchParams));
    const out = serializeActivityFilters({ ...filterParams, cursor });
    const query: Record<string, string> = { tab: "activity" };
    out.forEach((value, key) => {
        query[key] = value;
    });

    const href = buildWorkspacePath(workspaceId, "settings", query);

    return (
        <div className="border-t px-5 py-3">
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                <Link href={href}>Load more</Link>
            </Button>
        </div>
    );
}
