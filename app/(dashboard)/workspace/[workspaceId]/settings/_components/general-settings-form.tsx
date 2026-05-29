"use client";

import { saveGeneralSettingsAction } from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { EnvironmentPicker } from "@/components/ui/workspace/environment-picker";
import { UnsavedBar } from "@/components/ui/workspace/unsaved-bar";
import { type ActionResult } from "@/lib/action-result";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

const INITIAL: ActionResult = { ok: false };
const NAME_MAX = 80;
const MIN_MULTIPLIER = 2;
const MAX_MULTIPLIER = 20;

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
    const [envResetKey, setEnvResetKey] = useState(0);
    const [spikeEnabled, setSpikeEnabled] = useState(spike?.enabled ?? false);
    const [multiplier, setMultiplier] = useState((spike?.multiplier ?? 5).toString());

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

    const discard = () => {
        setName(currentName);
        setEnvironment(currentEnvironment);
        setEnvResetKey((k) => k + 1);
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
                    <EnvironmentPicker
                        key={envResetKey}
                        value={environment}
                        onChange={setEnvironment}
                        invalid={Boolean(state.fieldErrors?.environment)}
                    />
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
