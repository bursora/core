"use client";

import { Input } from "./input";
import { cn } from "@/lib/utils";
import * as React from "react";

interface MoneyInputProps extends Omit<React.ComponentProps<"input">, "size" | "type"> {
    readonly value: string;
    readonly onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    readonly presets?: readonly number[];
    readonly currency?: string;
    readonly size?: "default" | "lg";
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
    { className, value, onChange, presets, currency = "USD", size = "default", ...props },
    ref,
) {
    const isLarge = size === "lg";
    const setPreset = (preset: number) => {
        const next = String(preset);
        if (next === value) return;
        const event = {
            target: { value: next },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(event);
    };
    return (
        <div className="space-y-2">
            <div
                className={cn(
                    "flex items-center gap-2 rounded-md border border-input bg-transparent px-3 shadow-xs transition-colors dark:bg-input/30",
                    "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
                    "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
                    className,
                )}
            >
                <span
                    aria-hidden
                    className={cn(
                        "font-medium text-muted-foreground",
                        isLarge ? "text-lg" : "text-sm",
                    )}
                >
                    $
                </span>
                <Input
                    ref={ref}
                    inputMode="decimal"
                    autoComplete="off"
                    value={value}
                    onChange={onChange}
                    {...props}
                    className={cn(
                        "border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent",
                        isLarge
                            ? "h-11 text-xl font-semibold tabular-nums"
                            : "h-9 text-sm tabular-nums",
                    )}
                />
                <span className="text-xs font-medium text-muted-foreground">{currency}</span>
            </div>
            {presets && presets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {presets.map((preset) => {
                        const active = value === String(preset) || value === `${preset}.00`;
                        return (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => setPreset(preset)}
                                className={cn(
                                    "rounded-md border border-input bg-transparent px-2 py-0.5 text-xs tabular-nums transition-colors dark:bg-input/30",
                                    "hover:bg-accent hover:text-foreground",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    active
                                        ? "border-primary/40 bg-primary/10 text-primary dark:bg-primary/20"
                                        : "text-muted-foreground",
                                )}
                            >
                                ${preset}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
});
