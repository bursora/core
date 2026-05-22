import { FacetTabs } from "./facet-tabs";
import type { Facet } from "@/lib/metering/spend-series";
import { cn } from "@/lib/utils";
import { Bot, Cpu, Users, Workflow, type LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

interface Option {
    readonly key: Facet;
    readonly label: string;
    readonly Icon: LucideIcon;
}

const OPTIONS: readonly Option[] = [
    { key: "tenant", label: "Tenant", Icon: Users },
    { key: "agent", label: "Agent", Icon: Bot },
    { key: "workflow", label: "Workflow", Icon: Workflow },
    { key: "model", label: "Model", Icon: Cpu },
];

type Variant = "segmented" | "tabs";

interface GroupByFilterProps {
    readonly facet: Facet;
    readonly basePath: string;
    /** Other URL params to preserve. `facet` and `scope_id` are stripped — the
     *  scope id is bound to the prior facet and stops being meaningful.
     *  Undefined/empty values are dropped. */
    readonly otherParams?: Readonly<Record<string, string | undefined>>;
    readonly className?: string;
    /** `segmented` (default) — bordered control with icons + leading label, fits a filter row.
     *  `tabs` — borderless underline tabs, fits a section header. */
    readonly variant?: Variant;
}

export function GroupByFilter({
    facet,
    basePath,
    otherParams,
    className,
    variant = "segmented",
}: GroupByFilterProps) {
    if (variant === "tabs") {
        return (
            <FacetTabs
                facet={facet}
                mode={{ kind: "link", basePath, otherParams: otherParams ?? {} }}
                {...(className ? { className } : {})}
            />
        );
    }

    return (
        <div className={cn("inline-flex items-center gap-2", className)}>
            <span id="group-by-label" className="text-xs font-medium text-muted-foreground">
                Group by
            </span>
            <div
                role="group"
                aria-labelledby="group-by-label"
                className="inline-flex items-center rounded-md border bg-background p-0.5 shadow-sm"
            >
                {OPTIONS.map(({ key, label, Icon }) => {
                    const active = key === facet;
                    return (
                        <Link
                            key={key}
                            href={buildHref(basePath, otherParams, key)}
                            aria-pressed={active}
                            {...(active ? { "aria-current": "page" as const } : {})}
                            className={cn(
                                "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                active
                                    ? "bg-secondary text-secondary-foreground"
                                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                            )}
                        >
                            <Icon className="size-3.5" aria-hidden />
                            <span>{label}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

export function buildHref(
    basePath: string,
    otherParams: Readonly<Record<string, string | undefined>> | undefined,
    next: Facet,
): Route {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(otherParams ?? {})) {
        if (k === "facet" || k === "scope_id") continue;
        if (typeof v === "string" && v.length > 0) params.set(k, v);
    }
    if (next !== "tenant") params.set("facet", next);
    const qs = params.toString();
    return (qs.length === 0 ? basePath : `${basePath}?${qs}`) as Route;
}
