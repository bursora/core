"use client";

/**
 * AddFilterButton — entry point for the redesigned filter bar.
 *
 * Replaces the always-on dashed buttons for every dimension. Shows a single
 * "+ Add filter" affordance; clicking (or pressing F when no input is focused)
 * opens a Command palette listing dimensions that aren't already pinned in the
 * chip row. Selecting one bubbles up to ActiveFilters, which mounts that
 * dimension's FacetedFilter with `defaultOpen` so the value picker appears
 * immediately. No URL commit happens here — that's the value picker's job.
 */

import { PlusCircleIcon, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "../../command";
import { Popover, PopoverContent, PopoverTrigger } from "../../popover";

export interface AddFilterOption<K extends string> {
    readonly key: K;
    readonly label: string;
    readonly icon: LucideIcon;
}

interface AddFilterButtonProps<K extends string> {
    readonly options: readonly AddFilterOption<K>[];
    readonly onSelect: (key: K) => void;
}

export function AddFilterButton<K extends string>({ options, onSelect }: AddFilterButtonProps<K>) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handler = (e: KeyboardEvent): void => {
            if (e.key !== "f" && e.key !== "F") return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const tgt = e.target as HTMLElement | null;
            if (
                tgt?.tagName === "INPUT" ||
                tgt?.tagName === "TEXTAREA" ||
                tgt?.isContentEditable === true
            ) {
                return;
            }
            e.preventDefault();
            setOpen(true);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    if (options.length === 0) return null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-dashed">
                    <PlusCircleIcon className="size-3.5" aria-hidden />
                    Add filter
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Filter by…" />
                    <CommandList>
                        <CommandEmpty>No filters left.</CommandEmpty>
                        <CommandGroup>
                            {options.map((opt) => {
                                const Icon = opt.icon;
                                return (
                                    <CommandItem
                                        key={opt.key}
                                        onSelect={() => {
                                            setOpen(false);
                                            onSelect(opt.key);
                                        }}
                                    >
                                        <Icon
                                            className="mr-2 size-4 text-muted-foreground"
                                            aria-hidden
                                        />
                                        <span>{opt.label}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
