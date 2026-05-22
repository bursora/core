// Inline mono status label. Replaces shadcn Badge for status/mode/severity.
// No chrome, no rounded pill - just colored mono text. Optional filled
// variant for higher-priority callouts (still no border).

import { cn } from "@/lib/utils";
import type { StatusTagTone } from "@/lib/status-tag-tone";
import type { ReactNode } from "react";

export type { StatusTagTone };

export type StatusTagVariant = "inline" | "pill";

interface StatusTagProps {
    readonly tone: StatusTagTone;
    readonly variant?: StatusTagVariant;
    readonly children: ReactNode;
    readonly className?: string;
}

const INLINE_TONE: Record<StatusTagTone, string> = {
    destructive: "text-destructive",
    warning: "text-warning",
    success: "text-success",
    muted: "text-muted-foreground",
    foreground: "text-foreground",
    info: "text-foreground",
};

const PILL_TONE: Record<StatusTagTone, string> = {
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-warning/10 text-warning",
    success: "bg-success/10 text-success",
    muted: "bg-muted text-muted-foreground",
    foreground: "bg-muted text-foreground",
    info: "bg-muted text-foreground",
};

const INLINE_BASE = "font-mono text-[10px] uppercase tracking-[0.08em]";
const PILL_BASE =
    "inline-flex shrink-0 items-center gap-1 rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] tabular-nums";

export function StatusTag({ tone, variant = "inline", children, className }: StatusTagProps) {
    const base = variant === "pill" ? PILL_BASE : INLINE_BASE;
    const toneClass = variant === "pill" ? PILL_TONE[tone] : INLINE_TONE[tone];
    return <span className={cn(base, toneClass, className)}>{children}</span>;
}
