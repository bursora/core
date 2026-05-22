"use client";

/**
 * Workspace spike-protection toggle + threshold-multiplier input.
 *
 * The toggle overrides the global env flag (so cloud workspaces can opt out
 * and self-host workspaces can opt in). The multiplier defines how far above
 * the 7-day baseline traffic can spike before the middleware kicks in;
 * accepts 2.0–20.0.
 */

import { saveSpikeProtectionAction } from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type ActionResult } from "@/lib/action-result";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

const INITIAL: ActionResult = { ok: false };
const MIN_MULTIPLIER = 2;
const MAX_MULTIPLIER = 20;

interface SpikeProtectionFormProps {
    readonly workspaceId: string;
    readonly initialEnabled: boolean;
    readonly initialMultiplier: number;
}

export function SpikeProtectionForm({
    workspaceId,
    initialEnabled,
    initialMultiplier,
}: SpikeProtectionFormProps) {
    const [state, formAction, pending] = useActionState<ActionResult, FormData>(
        saveSpikeProtectionAction,
        INITIAL,
    );
    const [enabled, setEnabled] = useState(initialEnabled);
    const [multiplier, setMultiplier] = useState(initialMultiplier.toString());

    useEffect(() => {
        if (state.ok) toast.success("Spike protection updated.");
        else if (state.error) toast.error(state.error);
    }, [state]);

    const parsed = Number.parseFloat(multiplier);
    const validMultiplier =
        Number.isFinite(parsed) && parsed >= MIN_MULTIPLIER && parsed <= MAX_MULTIPLIER;
    const dirty = enabled !== initialEnabled || (validMultiplier && parsed !== initialMultiplier);

    return (
        <form action={formAction} className="space-y-4">
            <input type="hidden" name="workspaceId" value={workspaceId} />
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
                    checked={enabled}
                    onCheckedChange={setEnabled}
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
                    aria-invalid={state.fieldErrors?.thresholdMultiplier ? true : undefined}
                />
                <p className="text-xs text-muted-foreground">
                    Cap is baseline events/min times this multiplier. Lower is tighter; 5 is the
                    default.
                </p>
                {state.fieldErrors?.thresholdMultiplier ? (
                    <p className="text-xs text-destructive">
                        {state.fieldErrors.thresholdMultiplier}
                    </p>
                ) : null}
            </div>
            <Button type="submit" disabled={pending || !dirty || !validMultiplier}>
                {pending ? "Saving…" : "Save"}
            </Button>
        </form>
    );
}
