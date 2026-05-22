"use client";

import { type WindowKey } from "@/lib/dashboard-window";
import { cn } from "@/lib/utils";
import { Button } from "../../button";
import { useUrlParamCommit } from "../../hooks/use-url-param-commit";

const PILLS: readonly { readonly key: WindowKey; readonly label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
];

export function WindowFilter({ value }: { readonly value: WindowKey }) {
    const { commit, isPending } = useUrlParamCommit();

    return (
        <div
            role="group"
            aria-label="Time window"
            aria-busy={isPending}
            className={cn(
                "inline-flex items-center rounded-md border bg-background p-0.5",
                isPending && "opacity-70",
            )}
        >
            {PILLS.map((p) => {
                const active = p.key === value;
                return (
                    <Button
                        key={p.key}
                        type="button"
                        variant={active ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => commit({ set: { window: p.key } })}
                        aria-pressed={active}
                        className="h-7 px-2.5 text-xs font-medium"
                    >
                        {p.label}
                    </Button>
                );
            })}
        </div>
    );
}
