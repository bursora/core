/**
 * Small pill that visualizes a fractional delta (e.g. 0.12 → "↑ 12%").
 * Positive deltas render in success tones; negative in destructive.
 * Zero renders muted.
 */

import { ArrowDown, ArrowUp } from "lucide-react";

interface DeltaPillProps {
    readonly delta: number;
}

export function DeltaPill({ delta }: DeltaPillProps) {
    const pct = Math.round(Math.abs(delta) * 100);

    if (delta === 0 || pct === 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-xs tabular-nums text-muted-foreground">
                0%
            </span>
        );
    }

    const positive = delta > 0;
    const Icon = positive ? ArrowUp : ArrowDown;
    const tone = positive ? "text-success" : "text-destructive";
    const label = positive ? `Up ${pct}%` : `Down ${pct}%`;

    return (
        <span
            className={`inline-flex items-center gap-0.5 text-xs tabular-nums ${tone}`}
            aria-label={label}
        >
            <Icon className="h-3 w-3" aria-hidden />
            {pct}%
        </span>
    );
}
