"use client";

import { saveGeneralSettingsAction } from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { UnsavedBar } from "@/components/ui/workspace/unsaved-bar";
import { type ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

const INITIAL: ActionResult = { ok: false };
const NAME_MAX = 80;
const ENV_MAX = 40;
const MIN_MULTIPLIER = 2;
const MAX_MULTIPLIER = 20;

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
const isCustomEnv = (value: string) => value.length > 0 && !PRESET_VALUES.includes(value);

interface SpikeSettings {
    readonly enabled: boolean;
    readonly multiplier: number;
}

interface GeneralSettingsFormProps {
    readonly workspaceId: string;
    readonly currentName: string;
    readonly currentEnvironment: string;
    readonly spike: SpikeSettings | null;
}

export function GeneralSettingsForm({
    workspaceId,
    currentName,
    currentEnvironment,
    spike,
}: GeneralSettingsFormProps) {
    const [state, formAction, pending] = useActionState<ActionResult, FormData>(
        saveGeneralSettingsAction,
        INITIAL,
    );
    const [name, setName] = useState(currentName);
    const [environment, setEnvironment] = useState(currentEnvironment);
    const [customMode, setCustomMode] = useState(isCustomEnv(currentEnvironment));
    const [spikeEnabled, setSpikeEnabled] = useState(spike?.enabled ?? false);
    const [multiplier, setMultiplier] = useState((spike?.multiplier ?? 5).toString());
    const customInputRef = useRef<HTMLInputElement>(null);
    const envInputId = useId();

    useEffect(() => {
        if (state.ok) toast.success("Settings saved.");
        else if (state.error) toast.error(state.error);
    }, [state]);

    const nameTrim = name.trim();
    const envTrim = environment.trim();
    const parsedMultiplier = Number.parseFloat(multiplier);
    const validMultiplier =
        !spike ||
        (Number.isFinite(parsedMultiplier) &&
            parsedMultiplier >= MIN_MULTIPLIER &&
            parsedMultiplier <= MAX_MULTIPLIER);

    const nameDirty = nameTrim !== currentName;
    const envDirty = envTrim !== currentEnvironment;
    const spikeDirty = spike
        ? spikeEnabled !== spike.enabled ||
          (validMultiplier && parsedMultiplier !== spike.multiplier)
        : false;
    const dirty = nameDirty || envDirty || spikeDirty;
    const canSave = nameTrim.length > 0 && envTrim.length > 0 && validMultiplier;

    const activeTile = customMode ? "__custom__" : environment;

    const selectPreset = (value: string) => {
        setCustomMode(false);
        setEnvironment(value);
    };

    const selectCustom = () => {
        setCustomMode(true);
        if (PRESET_VALUES.includes(environment)) setEnvironment("");
        requestAnimationFrame(() => customInputRef.current?.focus());
    };

    const discard = () => {
        setName(currentName);
        setEnvironment(currentEnvironment);
        setCustomMode(isCustomEnv(currentEnvironment));
        setSpikeEnabled(spike?.enabled ?? false);
        setMultiplier((spike?.multiplier ?? 5).toString());
    };

    return (
        <form action={formAction} className="space-y-6">
            <DashboardSection
                label="Workspace name"
                sublabel="shown in switcher · on shared invites"
            >
                <div className="space-y-2">
                    <Label htmlFor="workspace-name">Name</Label>
                    <Input
                        id="workspace-name"
                        name="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={NAME_MAX}
                        minLength={1}
                        aria-invalid={state.fieldErrors?.name ? true : undefined}
                    />
                    {state.fieldErrors?.name ? (
                        <p className="text-xs text-destructive">{state.fieldErrors.name}</p>
                    ) : null}
                </div>
            </DashboardSection>

            <DashboardSection
                label="Environment"
                sublabel="prod · staging · dev label shown in sidebar"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-1.5">
                        {PRESETS.map((preset) => (
                            <PresetTile
                                key={preset.value}
                                preset={preset}
                                selected={activeTile === preset.value}
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
                                value={environment}
                                onChange={(e) => setEnvironment(e.target.value)}
                                maxLength={ENV_MAX}
                                minLength={1}
                                placeholder="qa-eu, preview-42, …"
                                className="font-mono"
                                aria-invalid={state.fieldErrors?.environment ? true : undefined}
                            />
                        </div>
                    ) : null}

                    {state.fieldErrors?.environment ? (
                        <p className="text-xs text-destructive">{state.fieldErrors.environment}</p>
                    ) : null}
                </div>
                <input type="hidden" name="environment" value={environment} />
            </DashboardSection>

            {spike ? (
                <DashboardSection
                    label="Spike protection"
                    sublabel="7-day baseline · 30-min cooldown"
                >
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <Label htmlFor="spike-enabled">Block runaway loops</Label>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Drop ingest traffic that overshoots your 7-day baseline.
                                </p>
                            </div>
                            <Switch
                                id="spike-enabled"
                                name="enabled"
                                checked={spikeEnabled}
                                onCheckedChange={setSpikeEnabled}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="spike-multiplier">Threshold multiplier</Label>
                            <Input
                                id="spike-multiplier"
                                name="thresholdMultiplier"
                                type="number"
                                step="0.5"
                                min={MIN_MULTIPLIER}
                                max={MAX_MULTIPLIER}
                                value={multiplier}
                                onChange={(e) => setMultiplier(e.target.value)}
                                aria-invalid={
                                    state.fieldErrors?.thresholdMultiplier ? true : undefined
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                Cap is baseline events/min times this multiplier. Lower is tighter;
                                5 is the default.
                            </p>
                            {state.fieldErrors?.thresholdMultiplier ? (
                                <p className="text-xs text-destructive">
                                    {state.fieldErrors.thresholdMultiplier}
                                </p>
                            ) : null}
                        </div>
                    </div>
                </DashboardSection>
            ) : null}

            <input type="hidden" name="workspaceId" value={workspaceId} />
            <UnsavedBar
                visible={dirty}
                canSave={canSave && dirty}
                pending={pending}
                onDiscard={discard}
            />
        </form>
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
                selected
                    ? preset.selectedClass
                    : "border-border bg-background hover:border-foreground/30",
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
