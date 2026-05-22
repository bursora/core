import { cn } from "@/lib/utils";

export interface SegmentedBarSlice {
    readonly key: string;
    readonly share: number;
    readonly colorClass: string;
}

interface SegmentedBarProps {
    readonly slices: readonly SegmentedBarSlice[];
    readonly ariaLabel: string;
    readonly className?: string;
}

export function SegmentedBar({ slices, ariaLabel, className }: SegmentedBarProps) {
    return (
        <div
            role="img"
            aria-label={ariaLabel}
            className={cn("flex h-2 w-full overflow-hidden rounded-full bg-muted", className)}
        >
            {slices.map((s) => (
                <div
                    key={s.key}
                    className={cn("h-full", s.colorClass)}
                    style={{ width: `${Math.max(0, Math.min(100, s.share * 100))}%` }}
                />
            ))}
        </div>
    );
}
