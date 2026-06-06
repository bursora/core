"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { BillingInterval } from "@/lib/plans/plan";

interface BillingIntervalToggleProps {
    readonly value: BillingInterval;
    readonly onChange: (next: BillingInterval) => void;
}

/**
 * Monthly/annual selector shared by the onboarding plan step and the landing
 * price card. Annual carries the "2 months free" badge; the caller decides the
 * default and renders the price for the selected interval.
 */
export function BillingIntervalToggle({ value, onChange }: BillingIntervalToggleProps) {
    return (
        <ToggleGroup
            type="single"
            value={value}
            onValueChange={(next) => {
                if (next === "month" || next === "year") onChange(next);
            }}
            aria-label="Billing interval"
            className="w-fit"
        >
            <ToggleGroupItem
                value="month"
                className="flex-none px-3.5 py-2 data-[state=on]:ring-1 data-[state=on]:ring-inset data-[state=on]:ring-border"
            >
                Monthly
            </ToggleGroupItem>
            <ToggleGroupItem
                value="year"
                className="flex-none gap-2 px-3.5 py-2 data-[state=on]:ring-1 data-[state=on]:ring-inset data-[state=on]:ring-border"
            >
                Annual
                <span className="whitespace-nowrap rounded-full bg-success/15 px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none tracking-[0.04em] text-success">
                    2 months free
                </span>
            </ToggleGroupItem>
        </ToggleGroup>
    );
}
