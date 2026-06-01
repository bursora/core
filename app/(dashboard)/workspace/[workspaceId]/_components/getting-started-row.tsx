"use client";

/**
 * One row of the sidebar "Getting started" checklist.
 *
 * Done rows (server-derived) and the first-event row once it lands both render
 * the same way — a green check + muted label — so a received first event looks
 * identical to the other completed steps. While the first event is still
 * pending, the row polls live and shows the label with a small "waiting"
 * indicator. Todo rows are links with a chevron.
 */

import { FirstEventStatus, useFirstEventPoll } from "@/components/ui/first-event-poll";
import type { GettingStartedRow } from "@/lib/onboarding/getting-started-rows";
import { cn } from "@/lib/utils";
import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";

interface RowItemProps {
    readonly row: GettingStartedRow;
    readonly workspaceId: string;
}

function DoneRow({ label }: { readonly label: string }) {
    return (
        <div className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-muted-foreground">
            <Check aria-hidden className="size-3.5 shrink-0 text-success" />
            <span>{label}</span>
        </div>
    );
}

function LiveRow({ workspaceId, label }: { readonly workspaceId: string; readonly label: string }) {
    const received = useFirstEventPoll(workspaceId);
    // Once the event lands, match the other done rows exactly.
    if (received) return <DoneRow label={label} />;
    return (
        <div className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs text-foreground">
            <span className="min-w-0 truncate">{label}</span>
            <FirstEventStatus received={false} />
        </div>
    );
}

export function GettingStartedRowItem({ row, workspaceId }: RowItemProps) {
    if (row.done) return <DoneRow label={row.label} />;
    if (row.live) return <LiveRow workspaceId={workspaceId} label={row.label} />;

    return (
        <Link
            href={row.href ?? "#"}
            className={cn(
                "group flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs text-foreground",
                "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
        >
            <span>{row.label}</span>
            <ChevronRight
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
        </Link>
    );
}
