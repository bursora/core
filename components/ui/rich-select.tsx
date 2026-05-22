"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

export interface RichSelectItem<T extends string> {
    readonly value: T;
    readonly label: string;
    readonly description?: string;
    readonly Icon?: LucideIcon;
}

interface RichSelectProps<T extends string> {
    readonly value: T;
    readonly onValueChange: (value: T) => void;
    readonly items: readonly RichSelectItem<T>[];
    readonly placeholder?: string;
    readonly id?: string;
    readonly name?: string;
    readonly disabled?: boolean;
    readonly triggerClassName?: string;
    readonly size?: "sm" | "default";
    readonly "aria-label"?: string;
}

export function RichSelect<T extends string>({
    value,
    onValueChange,
    items,
    placeholder,
    id,
    name,
    disabled,
    triggerClassName,
    size,
    "aria-label": ariaLabel,
}: RichSelectProps<T>) {
    const current = items.find((i) => i.value === value);
    return (
        <Select
            value={value}
            onValueChange={(v) => onValueChange(v as T)}
            {...(disabled !== undefined ? { disabled } : {})}
            {...(name ? { name } : {})}
        >
            <SelectTrigger
                id={id}
                aria-label={ariaLabel}
                {...(size ? { size } : {})}
                className={cn("w-full", triggerClassName)}
            >
                <SelectValue placeholder={placeholder}>
                    {current && (
                        <span className="flex items-center gap-2 text-sm">
                            {current.Icon && (
                                <current.Icon className="size-4 text-muted-foreground" />
                            )}
                            <span className="font-medium">{current.label}</span>
                        </span>
                    )}
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                {items.map((item) => (
                    <SelectItem
                        key={item.value}
                        value={item.value}
                        className={item.description ? "py-2" : undefined}
                    >
                        <span className="flex items-center gap-2.5 text-left">
                            {item.Icon && (
                                <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground">
                                    <item.Icon className="size-3.5" />
                                </span>
                            )}
                            <span className="flex flex-col leading-tight">
                                <span className="text-sm font-medium text-foreground">
                                    {item.label}
                                </span>
                                {item.description && (
                                    <span className="text-[11px] text-muted-foreground">
                                        {item.description}
                                    </span>
                                )}
                            </span>
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
