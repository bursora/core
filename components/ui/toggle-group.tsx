"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

function ToggleGroup({
    className,
    ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
    return (
        <ToggleGroupPrimitive.Root
            data-slot="toggle-group"
            className={cn(
                "inline-flex w-full items-center justify-stretch gap-1 rounded-md border bg-muted/40 p-1",
                className,
            )}
            {...props}
        />
    );
}

function ToggleGroupItem({
    className,
    ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
    return (
        <ToggleGroupPrimitive.Item
            data-slot="toggle-group-item"
            className={cn(
                "inline-flex flex-1 items-center justify-center rounded-sm px-2 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm disabled:pointer-events-none disabled:opacity-50",
                className,
            )}
            {...props}
        />
    );
}

export { ToggleGroup, ToggleGroupItem };
