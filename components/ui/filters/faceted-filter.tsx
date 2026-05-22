"use client";

import { type FacetedFilterOption } from "@/lib/filter-option";
import { cn } from "@/lib/utils";
import { CheckIcon, PlusCircleIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "../badge";
import { Button } from "../button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "../command";
import { useUrlParamCommit } from "../hooks/use-url-param-commit";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { Separator } from "../separator";

export type { FacetedFilterOption };

interface FacetedFilterProps {
    readonly paramKey: string;
    readonly label: string;
    readonly icon?: LucideIcon;
    readonly options: readonly FacetedFilterOption[];
    readonly selected: readonly string[];
    /** Single-select mode: picking a value replaces; same value clears. */
    readonly single?: boolean;
    /** URL keys to delete whenever the filter commits (e.g. pagination cursor). */
    readonly clearOnChange?: readonly string[];
    /**
     * Local-state mode: caller manages selection. When provided, the URL is not
     * touched. `paramKey` is ignored except as a popover identity.
     */
    readonly onChange?: (next: readonly string[]) => void;
    /** Pop open on mount — used when promoted from the Add filter palette. */
    readonly defaultOpen?: boolean;
    /** Notified on every popover open/close so callers can drop transient state. */
    readonly onOpenChange?: (open: boolean) => void;
    /**
     * Fires when a URL commit lands a non-empty selection. Lets a promoting
     * parent know the chip will become URL-driven on the next render, so it
     * can resolve transient `justAdded` state without a flicker window.
     */
    readonly onCommit?: () => void;
}

export function FacetedFilter({
    paramKey,
    label,
    icon: Icon,
    options,
    selected,
    single = false,
    clearOnChange,
    onChange,
    defaultOpen = false,
    onOpenChange,
    onCommit,
}: FacetedFilterProps) {
    const [open, setOpen] = useState(defaultOpen);
    const handleOpenChange = (next: boolean): void => {
        setOpen(next);
        onOpenChange?.(next);
    };
    const { commit, isPending } = useUrlParamCommit();

    const selectedSet = new Set(selected);

    const commitNext = (next: readonly string[]): void => {
        if (onChange !== undefined) {
            onChange(next);
            return;
        }
        const change: { set?: Record<string, string>; delete?: string[] } = {};
        const deleteKeys = clearOnChange ? [...clearOnChange] : [];
        if (next.length === 0) deleteKeys.push(paramKey);
        else change.set = { [paramKey]: next.join(",") };
        if (deleteKeys.length > 0) change.delete = deleteKeys;
        commit(change);
        if (next.length > 0) onCommit?.();
    };

    const toggle = (value: string): void => {
        if (single) {
            const next = selectedSet.has(value) ? [] : [value];
            commitNext(next);
            handleOpenChange(false);
            return;
        }
        const next = selectedSet.has(value)
            ? selected.filter((v) => v !== value)
            : [...selected, value];
        commitNext(next);
    };

    const clearAll = (): void => commitNext([]);

    const TriggerIcon = Icon ?? PlusCircleIcon;
    const hasSelection = selectedSet.size > 0;
    const orphanValues = Array.from(selectedSet).filter((v) => !options.some((o) => o.value === v));

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    aria-busy={isPending}
                    className={cn(
                        "h-9",
                        hasSelection ? "border-solid" : "border-dashed",
                        isPending && "opacity-70",
                    )}
                >
                    <TriggerIcon className="size-3.5" aria-hidden />
                    {label}
                    {hasSelection ? (
                        <>
                            <Separator orientation="vertical" className="mx-2 h-4" />
                            <Badge
                                variant="secondary"
                                className="rounded-sm px-1 font-normal lg:hidden"
                            >
                                {selectedSet.size}
                            </Badge>
                            <div className="hidden gap-1 lg:flex">
                                {selectedSet.size > 2 ? (
                                    <Badge
                                        variant="secondary"
                                        className="rounded-sm px-1 font-normal"
                                    >
                                        {selectedSet.size} selected
                                    </Badge>
                                ) : (
                                    <>
                                        {options
                                            .filter((o) => selectedSet.has(o.value))
                                            .map((o) => (
                                                <Badge
                                                    key={o.value}
                                                    variant="secondary"
                                                    className="inline-flex items-center gap-1 rounded-sm px-1 font-normal"
                                                >
                                                    {o.icon ? (
                                                        <span className="inline-flex size-3 items-center justify-center [&_svg]:size-3">
                                                            {o.icon}
                                                        </span>
                                                    ) : null}
                                                    {o.label ?? o.value}
                                                </Badge>
                                            ))}
                                        {orphanValues.map((v) => (
                                            <Badge
                                                key={v}
                                                variant="secondary"
                                                className="rounded-sm px-1 font-normal"
                                            >
                                                {v}
                                            </Badge>
                                        ))}
                                    </>
                                )}
                            </div>
                        </>
                    ) : null}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
                    <CommandList>
                        <CommandEmpty>No results.</CommandEmpty>
                        <CommandGroup>
                            {options.map((opt) => {
                                const isSelected = selectedSet.has(opt.value);
                                return (
                                    <CommandItem key={opt.value} onSelect={() => toggle(opt.value)}>
                                        {single ? (
                                            <div
                                                className={cn(
                                                    "mr-2 flex size-4 items-center justify-center rounded-full border border-primary",
                                                    isSelected ? "" : "opacity-50",
                                                )}
                                            >
                                                {isSelected ? (
                                                    <div className="size-2 rounded-full bg-primary" />
                                                ) : null}
                                            </div>
                                        ) : (
                                            <div
                                                className={cn(
                                                    "mr-2 flex size-4 items-center justify-center rounded-sm border border-primary",
                                                    isSelected
                                                        ? "bg-primary"
                                                        : "opacity-50 [&_svg]:invisible",
                                                )}
                                            >
                                                <CheckIcon
                                                    className="size-3 text-primary-foreground"
                                                    strokeWidth={3}
                                                />
                                            </div>
                                        )}
                                        {opt.icon ? (
                                            <span className="mr-1.5 inline-flex size-4 items-center justify-center text-muted-foreground [&_svg]:size-4">
                                                {opt.icon}
                                            </span>
                                        ) : null}
                                        <span className="truncate">{opt.label ?? opt.value}</span>
                                        {opt.count > 0 ? (
                                            <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
                                                {opt.count.toLocaleString()}
                                            </span>
                                        ) : null}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        {hasSelection ? (
                            <>
                                <CommandSeparator />
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={clearAll}
                                        className="justify-center text-center"
                                    >
                                        Clear
                                    </CommandItem>
                                </CommandGroup>
                            </>
                        ) : null}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
