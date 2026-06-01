/**
 * Compact "Getting started" card for the sidebar footer. Receives the derived
 * rows + counts and the dismiss action (passed as a prop so this file stays free
 * of server-only imports and can be render-tested). Rows render via
 * `GettingStartedRowItem`. Sized for the narrow sidebar, so it stays terse.
 */

import { Button } from "@/components/ui/button";
import type { GettingStartedRow } from "@/lib/onboarding/getting-started-rows";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { GettingStartedRowItem } from "./getting-started-row";

interface GettingStartedCardProps {
    readonly workspaceId: string;
    readonly rows: ReadonlyArray<GettingStartedRow>;
    readonly completed: number;
    readonly total: number;
    readonly dismissAction: (formData: FormData) => Promise<void>;
}

// Static width classes so Tailwind's JIT picks them up (a computed `w-[${n}%]`
// wouldn't be generated). Keyed by completed-of-five; the widget hides at 5/5.
const FILL_WIDTH: Record<number, string> = {
    0: "w-0",
    1: "w-1/5",
    2: "w-2/5",
    3: "w-3/5",
    4: "w-4/5",
    5: "w-full",
};

export function GettingStartedCard({
    workspaceId,
    rows,
    completed,
    total,
    dismissAction,
}: GettingStartedCardProps) {
    return (
        <div className="rounded-[8px] border border-border bg-background p-2">
            <div className="flex items-center gap-2 px-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
                    Getting started
                </span>
                <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                    {completed}/{total}
                </span>
                <form action={dismissAction}>
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <Button
                        type="submit"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Dismiss getting started"
                    >
                        <X aria-hidden />
                    </Button>
                </form>
            </div>

            <div
                className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={completed}
                aria-valuemin={0}
                aria-valuemax={total}
            >
                <div
                    className={cn(
                        "h-full rounded-full bg-success transition-[width] motion-reduce:transition-none",
                        FILL_WIDTH[completed] ?? "w-0",
                    )}
                />
            </div>

            <ul className="mt-1.5 flex flex-col gap-px">
                {rows.map((row) => (
                    <li key={row.key}>
                        <GettingStartedRowItem row={row} workspaceId={workspaceId} />
                    </li>
                ))}
            </ul>
        </div>
    );
}
