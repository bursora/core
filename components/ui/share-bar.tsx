import { cn } from "@/lib/utils";

interface ShareBarProps {
    /** Percent of total, 0..100. */
    percent: number;
    /** Accessible label describing what this share represents. */
    ariaLabel: string;
    className?: string;
    /** Optional tailwind class for the fill bar; defaults to `bg-primary/70`. */
    fillClassName?: string;
    children?: React.ReactNode;
}

/**
 * Renders content over a horizontal "share-of-total" fill. Uses a CSS variable
 * (`--share-pct`) so the dynamic value lives off the className surface — keeping
 * the inline-style escape hatch isolated to this shadcn-tier primitive.
 */
export function ShareBar({
    percent,
    ariaLabel,
    className,
    fillClassName,
    children,
}: ShareBarProps) {
    const clamped = Math.max(0, Math.min(100, percent));
    return (
        <div
            aria-label={ariaLabel}
            role="progressbar"
            aria-valuenow={clamped}
            aria-valuemin={0}
            aria-valuemax={100}
            className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
        >
            <div
                className={cn("h-full rounded-full bg-primary/70", fillClassName)}
                style={{ width: `${clamped}%` }}
            />
            {children}
        </div>
    );
}
