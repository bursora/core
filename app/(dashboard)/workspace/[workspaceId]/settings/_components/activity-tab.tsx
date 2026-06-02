import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { DateRangeFilter } from "@/components/ui/workspace/filters/date-range-filter";
import { StatusTag } from "@/components/ui/workspace/status-tag";
import { listActivityPage } from "@/lib/compose/activity";
import { formatRelativeTime } from "@/lib/format";
import {
    ACTIVITY_KIND_LABELS,
    deserializeActivityFilters,
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
import { LoadMoreButton } from "./load-more-button";

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
        readonly shown?: string;
    };
}

const DEFAULT_ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVITY_PAGE_SIZE = 50;
const MAX_ACTIVITY_SHOWN = 500;

// "Load more" grows this count so rows accumulate from newest, rather than
// paging to older items and dropping what was already on screen.
function parseShown(raw: string | undefined): number {
    const n = Number.parseInt(raw ?? "", 10);
    if (!Number.isFinite(n) || n < ACTIVITY_PAGE_SIZE) return ACTIVITY_PAGE_SIZE;
    return Math.min(n, MAX_ACTIVITY_SHOWN);
}

function toSearchParams(input: ActivityTabProps["searchParams"]): URLSearchParams {
    const out = new URLSearchParams();
    if (input.kind !== undefined) out.set("kind", input.kind);
    if (input.severity !== undefined) out.set("severity", input.severity);
    if (input.from !== undefined) out.set("from", input.from);
    if (input.to !== undefined) out.set("to", input.to);
    return out;
}

export async function ActivityTab({
    workspaceId,
    searchParams,
}: ActivityTabProps): Promise<React.JSX.Element> {
    const parsed = deserializeActivityFilters(toSearchParams(searchParams));
    const shown = parseShown(searchParams.shown);

    const now = new Date();
    const to = parsed.to ?? now;
    const from = parsed.from ?? new Date(to.getTime() - DEFAULT_ACTIVITY_WINDOW_MS);

    const filters: ActivityFilterValues = {
        from,
        ...(parsed.kind !== undefined ? { kind: parsed.kind } : {}),
        ...(parsed.severity !== undefined ? { severity: parsed.severity } : {}),
    };

    const page = await listActivityPage({ workspaceId, now, filters, limit: shown });
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
                            <DayItems items={group.items} workspaceId={workspaceId} />
                        </li>
                    ))}
                </ul>
            )}

            {page.nextCursor !== null ? (
                <LoadMoreButton
                    href={loadMoreHref(workspaceId, searchParams, shown + ACTIVITY_PAGE_SIZE)}
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

interface DayItemsProps {
    readonly items: readonly ActivityItem[];
    readonly workspaceId: string;
}

/**
 * Within a day, fold the per-hour event buckets into a single expandable
 * "N events" summary. Alerts and key changes always render as their own rows.
 */
function DayItems({ items, workspaceId }: DayItemsProps): React.JSX.Element {
    const events = items.filter((i) => i.kind === "event_ingested");
    const others = items.filter((i) => i.kind !== "event_ingested");

    return (
        <ul className="divide-y divide-border/40">
            {events.length >= 2 ? (
                <li>
                    <DayEventSummary events={events} workspaceId={workspaceId} />
                </li>
            ) : (
                events.map((item, idx) => (
                    <ActivityRow
                        key={`${item.at.toISOString()}-e${idx}`}
                        item={item}
                        workspaceId={workspaceId}
                    />
                ))
            )}
            {others.map((item, idx) => (
                <ActivityRow
                    key={`${item.at.toISOString()}-o${idx}`}
                    item={item}
                    workspaceId={workspaceId}
                />
            ))}
        </ul>
    );
}

interface DayEventSummaryProps {
    readonly events: readonly ActivityItem[];
    readonly workspaceId: string;
}

function DayEventSummary({ events, workspaceId }: DayEventSummaryProps): React.JSX.Element {
    const total = events.reduce((sum, e) => sum + (e.count ?? 0), 0);

    return (
        <Accordion type="single" collapsible>
            <AccordionItem value="events" className="border-b-0">
                <AccordionTrigger className="items-center gap-3 px-5 py-2.5 font-normal hover:bg-muted/40 hover:no-underline focus-visible:bg-muted/50 focus-visible:ring-0">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground">
                        <TrendingUp aria-hidden="true" className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left text-sm">
                        <span className="font-medium text-foreground">{total} events</span>
                    </span>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                    <ul className="divide-y divide-border/40 border-t border-border/40">
                        {events.map((item, idx) => (
                            <ActivityRow
                                key={`${item.at.toISOString()}-${idx}`}
                                item={item}
                                workspaceId={workspaceId}
                            />
                        ))}
                    </ul>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
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

function loadMoreHref(
    workspaceId: string,
    searchParams: ActivityTabProps["searchParams"],
    shown: number,
): Route {
    const query: Record<string, string> = { tab: "activity", shown: String(shown) };
    if (searchParams.kind !== undefined) query.kind = searchParams.kind;
    if (searchParams.severity !== undefined) query.severity = searchParams.severity;
    if (searchParams.from !== undefined) query.from = searchParams.from;
    if (searchParams.to !== undefined) query.to = searchParams.to;
    return buildWorkspacePath(workspaceId, "settings", query);
}
