"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useId, useRef, useState } from "react";

const ENV_MAX = 40;

interface Preset {
    readonly value: string;
    readonly tagline: string;
    readonly dotClass: string;
    readonly selectedClass: string;
}

const PRESETS: ReadonlyArray<Preset> = [
    {
        value: "prod",
        tagline: "stable",
        dotClass: "bg-success",
        selectedClass: "border-success/50 bg-success/5",
    },
    {
        value: "staging",
        tagline: "canary",
        dotClass: "bg-warning",
        selectedClass: "border-warning/50 bg-warning/5",
    },
    {
        value: "dev",
        tagline: "wip",
        dotClass: "bg-foreground/50",
        selectedClass: "border-foreground/40 bg-muted",
    },
];

const PRESET_VALUES = PRESETS.map((p) => p.value);

export const isCustomEnv = (value: string) => value.length > 0 && !PRESET_VALUES.includes(value);

interface EnvironmentPickerProps {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly invalid?: boolean;
}

export function EnvironmentPicker({ value, onChange, invalid }: EnvironmentPickerProps) {
    const [customMode, setCustomMode] = useState(isCustomEnv(value));
    const customInputRef = useRef<HTMLInputElement>(null);
    const envInputId = useId();

    const selectPreset = (next: string) => {
        setCustomMode(false);
        onChange(next);
    };

    const selectCustom = () => {
        setCustomMode(true);
        if (PRESET_VALUES.includes(value)) onChange("");
        requestAnimationFrame(() => customInputRef.current?.focus());
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-4 gap-1.5">
                {PRESETS.map((preset) => (
                    <PresetTile
                        key={preset.value}
                        preset={preset}
                        selected={!customMode && value === preset.value}
                        onClick={() => selectPreset(preset.value)}
                    />
                ))}
                <button
                    type="button"
                    onClick={selectCustom}
                    aria-pressed={customMode}
                    className={cn(
                        "flex flex-col items-start gap-1 rounded-md border border-dashed p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        customMode
                            ? "border-foreground/40 bg-muted"
                            : "border-border bg-background hover:border-foreground/30",
                    )}
                >
                    <span className="flex items-center gap-1.5">
                        <Plus
                            className={cn(
                                "h-2 w-2",
                                customMode ? "text-foreground" : "text-muted-foreground",
                            )}
                        />
                        <span className="font-mono text-xs text-foreground">custom</span>
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                        own label
                    </span>
                </button>
            </div>

            {customMode ? (
                <div className="space-y-2">
                    <Label
                        htmlFor={envInputId}
                        className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
                    >
                        Custom label
                    </Label>
                    <Input
                        ref={customInputRef}
                        id={envInputId}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        maxLength={ENV_MAX}
                        minLength={1}
                        placeholder="qa-eu, preview-42, …"
                        className="font-mono"
                        aria-invalid={invalid ? true : undefined}
                    />
                </div>
            ) : null}
        </div>
    );
}

interface PresetTileProps {
    readonly preset: Preset;
    readonly selected: boolean;
    readonly onClick: () => void;
}

function PresetTile({ preset, selected, onClick }: PresetTileProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={cn(
                "flex flex-col items-start gap-1 rounded-md border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? preset.selectedClass : "border-border bg-background hover:border-foreground/30",
            )}
        >
            <span className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", preset.dotClass)} />
                <span className="font-mono text-xs text-foreground">{preset.value}</span>
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                {preset.tagline}
            </span>
        </button>
    );
}
