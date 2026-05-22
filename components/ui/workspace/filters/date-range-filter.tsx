"use client";

import { cn } from "@/lib/utils";
import { Button } from "../../button";
import { useUrlParamCommit } from "../../hooks/use-url-param-commit";
import { DateRangePicker } from "./date-range-picker";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface QuickPreset {
    readonly id: "24h" | "7d" | "30d";
    readonly label: string;
    readonly spanMs: number;
}

const QUICK_PRESETS: readonly QuickPreset[] = [
    { id: "24h", label: "24h", spanMs: 24 * HOUR_MS },
    { id: "7d", label: "7d", spanMs: 7 * DAY_MS },
    { id: "30d", label: "30d", spanMs: 30 * DAY_MS },
];

// A pill is highlighted when the window's span matches its rolling span within
// a tight tolerance. Span-only is intentional: comparing `to` to a freshly-read
// `Date.now()` during render would violate React's purity rules and add noise.
const MATCH_TOLERANCE_MS = 2 * 60 * 1000;

function findActivePreset(from: Date, to: Date): QuickPreset["id"] | null {
    const span = to.getTime() - from.getTime();
    for (const p of QUICK_PRESETS) {
        if (Math.abs(span - p.spanMs) <= MATCH_TOLERANCE_MS) return p.id;
    }
    return null;
}

interface DateRangeFilterProps {
    readonly from: Date;
    readonly to: Date;
    /** URL keys to write `from` and `to` ISO strings under. Default: `from`/`to`. */
    readonly paramKeys?: { readonly from: string; readonly to: string };
}

export function DateRangeFilter({
    from,
    to,
    paramKeys = { from: "from", to: "to" },
}: DateRangeFilterProps) {
    const { commit, isPending } = useUrlParamCommit();
    const activePreset = findActivePreset(from, to);

    const commitRange = (nextFrom: Date, nextTo: Date): void => {
        commit({
            set: {
                [paramKeys.from]: nextFrom.toISOString(),
                [paramKeys.to]: nextTo.toISOString(),
            },
        });
    };

    const applyQuick = (spanMs: number): void => {
        const nextTo = new Date();
        const nextFrom = new Date(nextTo.getTime() - spanMs);
        commitRange(nextFrom, nextTo);
    };

    return (
        <div
            className={cn("flex flex-wrap items-center gap-2", isPending && "opacity-70")}
            aria-busy={isPending}
        >
            <div
                role="group"
                aria-label="Quick range"
                className="inline-flex items-center rounded-md border bg-background p-0.5"
            >
                {QUICK_PRESETS.map((p) => {
                    const active = activePreset === p.id;
                    return (
                        <Button
                            key={p.id}
                            type="button"
                            variant={active ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => applyQuick(p.spanMs)}
                            aria-pressed={active}
                            className="h-7 px-2.5 text-xs font-medium"
                        >
                            {p.label}
                        </Button>
                    );
                })}
            </div>

            <DateRangePicker
                from={from}
                to={to}
                onApply={(next) => commitRange(next.from, next.to)}
            />
        </div>
    );
}
