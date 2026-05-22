/**
 * Renders a list of `(tag, costUsd, callCount)` rows as horizontal share bars.
 * Shared by the dashboard's Top spenders and Spend by model panels: same
 * shape, same primitive, just different facets and labels.
 */

import { ShareBar } from "../share-bar";
import { formatCount, formatUsd } from "@/lib/format";

export interface SpendShareRow {
    readonly tag: string;
    readonly costUsd: string;
    readonly callCount: number;
}

interface SpendShareListProps {
    readonly rows: readonly SpendShareRow[];
    /** Used by aria-label, e.g. "of top spenders total". */
    readonly shareNoun: string;
}

export function SpendShareList({ rows, shareNoun }: SpendShareListProps) {
    const total = rows.reduce((acc, r) => acc + Number.parseFloat(r.costUsd), 0);

    return (
        <ul className="flex flex-col gap-3">
            {rows.map((r) => {
                const cost = Number.parseFloat(r.costUsd);
                const pct = total === 0 ? 0 : Math.round((cost / total) * 100);
                return (
                    <li key={r.tag} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-3">
                            <code className="truncate font-mono text-sm text-foreground">
                                {r.tag}
                            </code>
                            <div className="flex shrink-0 items-baseline gap-2 tabular-nums">
                                <span className="text-xs text-muted-foreground">
                                    {formatCount(r.callCount)} call{r.callCount === 1 ? "" : "s"}
                                </span>
                                <span className="text-sm font-medium text-foreground">
                                    {formatUsd(r.costUsd)}
                                </span>
                            </div>
                        </div>
                        <ShareBar percent={pct} ariaLabel={`${r.tag}: ${pct}% ${shareNoun}`} />
                    </li>
                );
            })}
        </ul>
    );
}
