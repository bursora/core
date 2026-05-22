"use client";

/**
 * FacetTabs — borderless underline tabs for switching the active facet.
 *
 * Two modes, picked via discriminated union:
 *   - `link`: renders each tab as a Next.js Link. Used by the real dashboard
 *     and `/spend`, where the facet is part of the URL.
 *   - `local`: renders each tab as a callback button. Used by the landing
 *     fixture, which lives outside the Next.js routing tree.
 *
 * The href shape for link mode matches `GroupByFilter.buildHref` exactly.
 */

import { buildHref } from "./group-by-filter";
import type { Facet } from "@/lib/metering/spend-series";
import { cn } from "@/lib/utils";
import Link from "next/link";

const OPTIONS: readonly { readonly key: Facet; readonly label: string }[] = [
    { key: "tenant", label: "Tenant" },
    { key: "agent", label: "Agent" },
    { key: "workflow", label: "Workflow" },
    { key: "model", label: "Model" },
];

type FacetTabsMode =
    | {
          readonly kind: "link";
          readonly basePath: string;
          readonly otherParams: Readonly<Record<string, string | undefined>>;
      }
    | { readonly kind: "local"; readonly onChange: (next: Facet) => void };

interface FacetTabsProps {
    readonly facet: Facet;
    readonly mode: FacetTabsMode;
    readonly className?: string;
}

const TAB_CLASSES =
    "border-b-2 pb-0.5 font-mono text-[11px] transition-colors focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function FacetTabs({ facet, mode, className }: FacetTabsProps) {
    return (
        <div
            role="group"
            aria-label="Group by"
            className={cn("inline-flex items-center gap-3", className)}
        >
            {OPTIONS.map(({ key, label }) => {
                const active = key === facet;
                const tone = active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground/70 hover:text-foreground";
                const tabClassName = cn(TAB_CLASSES, tone);

                if (mode.kind === "link") {
                    return (
                        <Link
                            key={key}
                            href={buildHref(mode.basePath, mode.otherParams, key)}
                            aria-pressed={active}
                            {...(active ? { "aria-current": "page" as const } : {})}
                            className={tabClassName}
                        >
                            {label}
                        </Link>
                    );
                }

                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => mode.onChange(key)}
                        aria-pressed={active}
                        className={tabClassName}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
