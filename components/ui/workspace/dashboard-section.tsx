// Shared shell for every workspace surface. One radius, one bg, one header
// voice. Variants only change padding density (tile vs section).

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type DashboardSectionVariant = "tile" | "section";

interface DashboardSectionProps {
    readonly variant?: DashboardSectionVariant;
    readonly label?: string;
    readonly sublabel?: string;
    readonly actions?: ReactNode;
    readonly children: ReactNode;
    readonly className?: string;
    readonly bodyClassName?: string;
}

const PADDING: Record<DashboardSectionVariant, string> = {
    tile: "p-3.5",
    section: "p-5",
};

export function DashboardSection({
    variant = "section",
    label,
    sublabel,
    actions,
    children,
    className,
    bodyClassName,
}: DashboardSectionProps) {
    const hasHeader = label !== undefined || sublabel !== undefined || actions !== undefined;
    return (
        <section
            className={cn(
                "rounded-[8px] border border-border bg-background",
                PADDING[variant],
                className,
            )}
        >
            {hasHeader ? (
                <div className="flex items-baseline justify-between gap-3">
                    <div className="flex min-w-0 items-baseline gap-2">
                        {label !== undefined ? (
                            <h2 className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                                {label}
                            </h2>
                        ) : null}
                        {sublabel !== undefined ? (
                            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/50">
                                {sublabel}
                            </span>
                        ) : null}
                    </div>
                    {actions !== undefined ? (
                        <div className="flex shrink-0 items-center gap-2">{actions}</div>
                    ) : null}
                </div>
            ) : null}
            <div className={cn(hasHeader ? "mt-3" : undefined, bodyClassName)}>{children}</div>
        </section>
    );
}
