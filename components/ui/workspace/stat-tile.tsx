// Compact stat tile: mono label + tabular value. Optional pressable mode for
// filter chips that toggle a state. Shares the dashboard shell (rounded-[8px],
// bg-background) so it sits next to Kpi/DashboardSection without drift.

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type StatTileTone = "muted" | "destructive" | "warning" | "success" | "foreground";

interface StatTileProps {
    readonly label: string;
    readonly value: ReactNode;
    readonly tone?: StatTileTone;
    readonly hint?: ReactNode;
    readonly pressed?: boolean;
    readonly onClick?: () => void;
}

const TONE_DOT: Record<StatTileTone, string> = {
    muted: "bg-muted-foreground/40",
    destructive: "bg-destructive",
    warning: "bg-warning",
    success: "bg-success",
    foreground: "bg-foreground",
};

const SHELL = "rounded-[8px] border border-border bg-background p-3.5 text-left";

export function StatTile({ label, value, tone = "muted", hint, pressed, onClick }: StatTileProps) {
    const body = (
        <>
            <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                <span className={cn("size-1.5 rounded-full", TONE_DOT[tone])} aria-hidden />
                {label}
            </div>
            <div className="mt-1.5 text-[24px] font-semibold tracking-[-0.02em] tabular-nums text-foreground">
                {value}
            </div>
            {hint !== undefined ? (
                <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
            ) : null}
        </>
    );

    if (onClick === undefined) {
        return <div className={SHELL}>{body}</div>;
    }

    return (
        <button
            type="button"
            aria-pressed={pressed ?? false}
            onClick={onClick}
            className={cn(
                SHELL,
                "cursor-pointer transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                pressed && "ring-2 ring-ring",
            )}
        >
            {body}
        </button>
    );
}
