// Sticky save bar for settings forms. Slides up from the bottom when the
// form is dirty; the Save button submits the parent <form>. Lives inside the
// form element so the submit wiring stays native.

"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UnsavedBarProps {
    readonly visible: boolean;
    readonly canSave: boolean;
    readonly pending: boolean;
    readonly onDiscard: () => void;
}

export function UnsavedBar({ visible, canSave, pending, onDiscard }: UnsavedBarProps) {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-hidden={!visible}
            className={cn(
                "fixed inset-x-0 bottom-0 z-30 px-6 pb-6 transition-all md:left-[var(--sidebar-width)] motion-reduce:transition-none",
                visible
                    ? "translate-y-0 opacity-100 duration-300 ease-out"
                    : "pointer-events-none translate-y-[140%] opacity-0 duration-150 ease-in",
            )}
        >
            <div className="flex w-full items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3 shadow-lg">
                <span className="flex items-center gap-2.5">
                    <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-foreground">
                        Unsaved changes
                    </span>
                </span>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onDiscard}
                        disabled={pending}
                    >
                        Discard
                    </Button>
                    <Button type="submit" size="sm" disabled={pending || !canSave}>
                        {pending ? "Saving…" : "Save changes"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
