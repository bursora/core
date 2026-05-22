"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelativeTime } from "@/lib/format";
import type { NotificationItem } from "@/lib/notifications/types";
import { SEVERITY_BG, SEVERITY_TEXT } from "@/lib/severity";
import { cn } from "@/lib/utils";
import { Bell, Check } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

const POLL_MS = 30_000;
const ENDPOINT = "/api/internal/user/notifications";
const EMPTY_TEXT = "You're all caught up";

interface NotificationsResponse {
    items: NotificationItem[];
}

const fetcher = async (url: string): Promise<NotificationsResponse> => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return { items: [] };
    return (await res.json()) as NotificationsResponse;
};

export function NotificationCenter() {
    const [open, setOpen] = useState(false);
    const { data, mutate } = useSWR<NotificationsResponse>(ENDPOINT, fetcher, {
        refreshInterval: open ? POLL_MS : 0,
        revalidateOnFocus: false,
        dedupingInterval: 10_000,
    });

    const items = useMemo(() => data?.items ?? [], [data?.items]);
    const unread = items.filter((i) => !i.read).length;

    const markRead = useCallback(
        async (payload: { itemIds: string[] | "all" }) => {
            await mutate(
                async (current) => {
                    await fetch(ENDPOINT, {
                        method: "POST",
                        credentials: "include",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(payload),
                    });
                    return current;
                },
                {
                    optimisticData: (current) => {
                        const source = current?.items ?? items;
                        const targetIds: ReadonlySet<string> =
                            payload.itemIds === "all"
                                ? new Set(source.map((i) => i.id))
                                : new Set(payload.itemIds);
                        return {
                            items: source.map((i) =>
                                targetIds.has(i.id) ? { ...i, read: true } : i,
                            ),
                        };
                    },
                    rollbackOnError: true,
                    revalidate: true,
                },
            );
        },
        [items, mutate],
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open notifications"
                    className="relative"
                >
                    <Bell className="h-4 w-4" />
                    {unread > 0 ? (
                        <>
                            <span
                                aria-hidden="true"
                                className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive"
                            />
                            <span className="sr-only">{unread} unread notifications</span>
                        </>
                    ) : null}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="flex w-96 flex-col gap-0 p-0">
                <header className="flex items-center justify-between border-b px-4 py-3">
                    <h2 className="text-sm font-semibold tracking-tight">Notifications</h2>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={unread === 0}
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                            void markRead({ itemIds: "all" });
                        }}
                    >
                        Mark all read
                    </Button>
                </header>

                <ScrollArea className="max-h-[28rem] min-h-0 flex-1">
                    {items.length === 0 ? (
                        <NotificationEmpty />
                    ) : (
                        <ul aria-live="polite" className="divide-y divide-border/60">
                            {items.map((item) => (
                                <NotificationRow
                                    key={item.id}
                                    item={item}
                                    onNavigate={() => setOpen(false)}
                                    onMarkRead={() => {
                                        if (item.read) return;
                                        void markRead({ itemIds: [item.id] });
                                    }}
                                />
                            ))}
                        </ul>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}

interface NotificationRowProps {
    item: NotificationItem;
    onNavigate: () => void;
    onMarkRead: () => void;
}

function NotificationRow({ item, onNavigate, onMarkRead }: NotificationRowProps) {
    const isUnread = !item.read;

    const content = (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    {isUnread ? (
                        <span
                            aria-hidden="true"
                            className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                SEVERITY_BG[item.severity],
                            )}
                        />
                    ) : null}
                    <p
                        className={cn(
                            "min-w-0 truncate text-sm",
                            isUnread ? "font-medium text-foreground" : "text-muted-foreground",
                            SEVERITY_TEXT[item.severity],
                        )}
                    >
                        {item.title}
                    </p>
                </div>
                <time
                    dateTime={item.createdAt}
                    className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground"
                >
                    {formatRelativeTime(new Date(item.createdAt))}
                </time>
            </div>
            <p
                className={cn(
                    "line-clamp-2 text-xs",
                    isUnread ? "text-foreground/80" : "text-muted-foreground",
                )}
            >
                {item.body}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
                in <span className="font-medium text-foreground/80">{item.workspaceName}</span>
            </p>
        </div>
    );

    return (
        <li className="group relative">
            {isUnread ? (
                <span
                    aria-hidden="true"
                    className={cn(
                        "absolute inset-y-2 left-0 w-[2px] rounded-r-full",
                        SEVERITY_BG[item.severity],
                    )}
                />
            ) : null}
            <div className="flex items-start gap-2 px-4 py-3 transition-colors hover:bg-muted/40">
                {item.href ? (
                    <Link
                        href={item.href as never}
                        onClick={onNavigate}
                        className="flex min-w-0 flex-1 focus:outline-none focus-visible:text-foreground"
                    >
                        {content}
                    </Link>
                ) : (
                    content
                )}

                {isUnread ? (
                    <button
                        type="button"
                        onClick={onMarkRead}
                        aria-label="Mark as read"
                        title="Mark as read"
                        className="size-6 shrink-0 rounded-md border border-transparent text-muted-foreground opacity-0 transition hover:border-border hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    >
                        <Check aria-hidden="true" className="m-auto size-3.5" />
                    </button>
                ) : null}
            </div>
        </li>
    );
}

function NotificationEmpty() {
    return (
        <div className="flex h-40 flex-col items-center justify-center gap-2 px-6 text-center">
            <Bell aria-hidden="true" className="size-6 text-muted-foreground/60" />
            <p className="text-sm font-medium">{EMPTY_TEXT}</p>
        </div>
    );
}
