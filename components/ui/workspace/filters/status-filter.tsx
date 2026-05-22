import type { MeteringStatusFilter } from "@/lib/metering";
import { cn } from "@/lib/utils";
import type { Route } from "next";
import Link from "next/link";

interface SegmentOption {
    readonly key: MeteringStatusFilter;
    readonly label: string;
}

const OPTIONS: readonly SegmentOption[] = [
    { key: "ok", label: "OK" },
    { key: "blocked", label: "Blocked" },
    { key: "both", label: "Both" },
];

interface StatusFilterProps {
    /** Current status. */
    readonly status: MeteringStatusFilter;
    /** Path the links resolve to (e.g. `/workspace/ws-a/spend`). */
    readonly basePath: string;
    /** Other URL params to preserve across segment changes. */
    readonly otherParams?: Readonly<Record<string, string>>;
}

export function StatusFilter({ status, basePath, otherParams }: StatusFilterProps) {
    return (
        <div
            role="group"
            aria-label="Call status"
            className="inline-flex items-center rounded-md border bg-background p-0.5"
        >
            {OPTIONS.map((opt) => {
                const active = opt.key === status;
                return (
                    <Link
                        key={opt.key}
                        href={buildHref(basePath, otherParams, opt.key)}
                        aria-pressed={active}
                        {...(active ? { "aria-current": "page" as const } : {})}
                        className={cn(
                            "inline-flex h-7 items-center justify-center rounded-sm px-2.5 text-xs font-medium transition-colors",
                            active
                                ? "bg-secondary text-secondary-foreground"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {opt.label}
                    </Link>
                );
            })}
        </div>
    );
}

function buildHref(
    basePath: string,
    otherParams: Readonly<Record<string, string>> | undefined,
    next: MeteringStatusFilter,
): Route {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(otherParams ?? {})) {
        if (v.length > 0) params.set(k, v);
    }
    // Omit `status=ok` so the default URL shape stays clean.
    if (next !== "ok") params.set("status", next);
    const qs = params.toString();
    return (qs.length === 0 ? basePath : `${basePath}?${qs}`) as Route;
}
