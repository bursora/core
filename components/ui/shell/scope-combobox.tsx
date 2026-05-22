"use client";

import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandList,
} from "../command";
import { Input } from "../input";
import { Popover, PopoverAnchor, PopoverContent } from "../popover";
import { cn } from "@/lib/utils";
import { ChevronsUpDownIcon } from "lucide-react";
import * as React from "react";

type ScopeKind = "tenant" | "agent" | "workflow";

interface ScopeComboboxProps {
    readonly scope: ScopeKind;
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly suggestions: readonly string[];
    readonly id?: string;
    readonly name?: string;
    readonly placeholder?: string;
    readonly disabled?: boolean;
    readonly className?: string;
    readonly onBlur?: (value: string) => void;
}

/**
 * Inline autocomplete for tenant/agent/workflow scope ids. Renders a normal
 * text input — typing filters the popover suggestions but does not constrain
 * submission. Pressing Enter or blurring commits whatever is typed.
 */
export function ScopeCombobox({
    scope,
    value,
    onChange,
    suggestions,
    id,
    name,
    placeholder,
    disabled,
    className,
    onBlur,
}: ScopeComboboxProps) {
    const [open, setOpen] = React.useState(false);

    const filtered = React.useMemo(() => {
        const q = value.trim().toLowerCase();
        if (q === "") return suggestions;
        return suggestions.filter((s) => s.toLowerCase().includes(q));
    }, [suggestions, value]);

    return (
        <Popover open={open && !disabled && filtered.length > 0} onOpenChange={setOpen}>
            <PopoverAnchor asChild>
                <div className={cn("relative", className)}>
                    <Input
                        id={id}
                        name={name}
                        type="text"
                        value={value}
                        placeholder={placeholder ?? `e.g. ${scope}-123`}
                        disabled={disabled}
                        autoComplete="off"
                        role="combobox"
                        aria-expanded={open}
                        aria-autocomplete="list"
                        onChange={(e) => {
                            onChange(e.target.value);
                            if (!open) setOpen(true);
                        }}
                        onFocus={() => setOpen(true)}
                        onBlur={(e) => {
                            setOpen(false);
                            onBlur?.(e.target.value);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") setOpen(false);
                        }}
                        className="pr-8"
                    />
                    <ChevronsUpDownIcon
                        aria-hidden="true"
                        className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 opacity-50"
                    />
                </div>
            </PopoverAnchor>
            <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0"
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <Command shouldFilter={false}>
                    <CommandList>
                        <CommandEmpty>No matches — press Enter to use typed value.</CommandEmpty>
                        <CommandGroup>
                            {filtered.map((s) => (
                                <CommandItem
                                    key={s}
                                    value={s}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        onChange(s);
                                        onBlur?.(s);
                                        setOpen(false);
                                    }}
                                    onSelect={() => {
                                        onChange(s);
                                        onBlur?.(s);
                                        setOpen(false);
                                    }}
                                >
                                    {s}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
