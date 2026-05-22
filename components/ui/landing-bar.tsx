import { cn } from "@/lib/utils";

interface FillBarProps {
    pct: number;
    className?: string;
}

export function LandingFillBar({ pct, className }: FillBarProps) {
    return (
        <span
            aria-hidden="true"
            className={cn("absolute inset-y-0 left-0", className)}
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
    );
}

interface ToggleThumbProps {
    left: number;
    width: number;
    className?: string;
}

export function LandingToggleThumb({ left, width, className }: ToggleThumbProps) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                "absolute bottom-1 top-1 rounded-full bg-accent transition-[left,width] duration-200",
                className,
            )}
            style={{ left, width }}
        />
    );
}
