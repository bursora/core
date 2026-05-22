"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

function RadioGroup({
    className,
    ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
    return (
        <RadioGroupPrimitive.Root
            data-slot="radio-group"
            className={cn("grid gap-2", className)}
            {...props}
        />
    );
}

function RadioGroupItem({
    className,
    ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
    return (
        <RadioGroupPrimitive.Item
            data-slot="radio-group-item"
            className={cn(
                "grid size-4 place-items-center rounded-full border border-input text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-primary disabled:pointer-events-none disabled:opacity-50",
                className,
            )}
            {...props}
        >
            <RadioGroupPrimitive.Indicator
                data-slot="radio-group-indicator"
                className="block size-2 rounded-full bg-primary"
            />
        </RadioGroupPrimitive.Item>
    );
}

function RadioGroupCard({
    className,
    children,
    ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
    return (
        <RadioGroupPrimitive.Item
            data-slot="radio-group-card"
            className={cn(
                "group relative flex flex-col items-start gap-2 rounded-lg border bg-background p-3 text-left transition-all hover:border-foreground/20 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-primary/60 data-[state=checked]:ring-1 data-[state=checked]:ring-primary/40 disabled:pointer-events-none disabled:opacity-50",
                className,
            )}
            {...props}
        >
            {children}
        </RadioGroupPrimitive.Item>
    );
}

export { RadioGroup, RadioGroupCard, RadioGroupItem };
