"use client";

import { CalendarIcon } from "lucide-react";
import * as React from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "../../button";
import { Calendar } from "../../calendar";
import { useTimeZone } from "../../hooks/use-time-zone";
import { Input } from "../../input";
import { Popover, PopoverContent, PopoverTrigger } from "../../popover";
import {
    applyDayToDateTime,
    applyTimeToDate,
    computePresetWindow,
    formatRangeButtonLabel,
    formatTimeInput,
    PRESETS,
    type PresetId,
} from "./date-range-picker-logic";

interface DateRangePickerProps {
    from: Date;
    to: Date;
    onApply: (next: { from: Date; to: Date }) => void;
}

export function DateRangePicker({ from, to, onApply }: DateRangePickerProps) {
    const tz = useTimeZone();
    const [open, setOpen] = React.useState(false);
    const [draftFrom, setDraftFrom] = React.useState<Date>(from);
    const [draftTo, setDraftTo] = React.useState<Date>(to);
    const [activePreset, setActivePreset] = React.useState<PresetId | null>(null);

    // Reseed local draft from URL state when the popover opens.
    const handleOpenChange = (next: boolean) => {
        if (next) {
            setDraftFrom(from);
            setDraftTo(to);
            setActivePreset(null);
        }
        setOpen(next);
    };

    const handlePreset = (preset: PresetId) => {
        const window = computePresetWindow(preset, new Date(), tz);
        setDraftFrom(window.from);
        setDraftTo(window.to);
        setActivePreset(preset);
    };

    const handleRangeSelect = (range: DateRange | undefined) => {
        if (!range) return;
        if (range.from) setDraftFrom(applyDayToDateTime(draftFrom, range.from));
        if (range.to) setDraftTo(applyDayToDateTime(draftTo, range.to));
        setActivePreset(null);
    };

    const handleFromTime = (value: string) => {
        setDraftFrom(applyTimeToDate(draftFrom, value));
        setActivePreset(null);
    };
    const handleToTime = (value: string) => {
        setDraftTo(applyTimeToDate(draftTo, value));
        setActivePreset(null);
    };

    const handleApply = () => {
        onApply({ from: draftFrom, to: draftTo });
        setOpen(false);
    };

    const handleCancel = () => setOpen(false);

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-9 justify-start gap-2 font-normal"
                    aria-label="Date range"
                >
                    <CalendarIcon className="size-3.5" />
                    <span>{formatRangeButtonLabel(from, to, tz)}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-auto p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <div className="flex flex-col sm:flex-row">
                    <div className="flex flex-row gap-1 border-b p-2 sm:flex-col sm:border-r sm:border-b-0">
                        {PRESETS.map((preset) => (
                            <Button
                                key={preset.id}
                                type="button"
                                variant={activePreset === preset.id ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => handlePreset(preset.id)}
                                className="justify-start font-normal"
                                aria-pressed={activePreset === preset.id}
                            >
                                {preset.label}
                            </Button>
                        ))}
                    </div>
                    <div className="flex flex-col">
                        <Calendar
                            mode="range"
                            numberOfMonths={2}
                            defaultMonth={draftFrom}
                            selected={{ from: draftFrom, to: draftTo }}
                            onSelect={handleRangeSelect}
                        />
                        <div className="flex items-center justify-between gap-3 border-t p-3">
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>Start</span>
                                <Input
                                    type="time"
                                    step={60}
                                    value={formatTimeInput(draftFrom)}
                                    onChange={(e) => handleFromTime(e.target.value)}
                                    aria-label="Start time"
                                    className="h-8 w-auto"
                                />
                            </label>
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>End</span>
                                <Input
                                    type="time"
                                    step={60}
                                    value={formatTimeInput(draftTo)}
                                    onChange={(e) => handleToTime(e.target.value)}
                                    aria-label="End time"
                                    className="h-8 w-auto"
                                />
                            </label>
                            <div className="ml-auto flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleCancel}
                                >
                                    Cancel
                                </Button>
                                <Button type="button" size="sm" onClick={handleApply}>
                                    Apply
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
