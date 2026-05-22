/**
 * Small color swatch used in chart legends and tooltips.
 *
 * Accepts a dynamic CSS color (e.g. `var(--primary)`) only knowable at render
 * time. Lives in `components/ui/` because the ESLint inline-style ban allows
 * className-bound CSS custom properties only inside this directory.
 */

interface SwatchDotProps {
    readonly color: string | undefined;
}

export function SwatchDot({ color }: SwatchDotProps) {
    return (
        <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-sm bg-[var(--swatch-color)]"
            style={{ "--swatch-color": color ?? "currentColor" } as React.CSSProperties}
        />
    );
}
