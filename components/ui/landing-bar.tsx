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
