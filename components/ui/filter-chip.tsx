import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export interface FilterChipProps extends HTMLAttributes<HTMLSpanElement> {
    readonly on?: boolean;
}

function FilterChip({ children, on, className, ...props }: FilterChipProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11.5px]",
                on
                    ? "border-input bg-accent text-foreground"
                    : "border-border bg-muted text-muted-foreground",
                className,
            )}
            {...props}
        >
            {children}
        </span>
    );
}

export { FilterChip };
