"use client";

/**
 * Workspace event-bundle settings form.
 *
 * Toggle enables a hard overage cap in USD. When off, accrued overage bills
 * without a ceiling. When on, an integer dollar amount is required; events
 * past that overage are rejected (HTTP 202 with `X-Bursora-Cap-Hit: events`).
 *
 * The current-cycle stats (events count, overage accrued, bundle remaining)
 * render above the form so operators can read the impact of their setting
 * without leaving the page.
 */

import { saveEventBundleAction } from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type ActionResult } from "@/lib/action-result";
import { formatCount, formatUsd } from "@/lib/format";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

const INITIAL: ActionResult = { ok: false };
const MIN_CAP_USD = 1;
const MAX_CAP_USD = 10_000;

interface EventBundleFormProps {
    readonly workspaceId: string;
    readonly initialHardCapUsd: number | null;
    readonly eventsCount: number;
    readonly overageCents: number;
    readonly bundleEvents: number;
}

export function EventBundleForm({
    workspaceId,
    initialHardCapUsd,
    eventsCount,
    overageCents,
    bundleEvents,
}: EventBundleFormProps) {
    const [state, formAction, pending] = useActionState<ActionResult, FormData>(
        saveEventBundleAction,
        INITIAL,
    );
    const [enabled, setEnabled] = useState(initialHardCapUsd !== null);
    const [capUsd, setCapUsd] = useState(
        initialHardCapUsd === null ? "" : initialHardCapUsd.toString(),
    );

    useEffect(() => {
        if (state.ok) toast.success("Event bundle updated.");
        else if (state.error) toast.error(state.error);
    }, [state]);

    const parsedCap = Number.parseInt(capUsd, 10);
    const validCap =
        !enabled ||
        (Number.isInteger(parsedCap) && parsedCap >= MIN_CAP_USD && parsedCap <= MAX_CAP_USD);

    const remaining = Math.max(0, bundleEvents - eventsCount);
    const overageUsd = overageCents / 100;

    return (
        <form action={formAction} className="space-y-4">
            <input type="hidden" name="workspaceId" value={workspaceId} />

            <dl className="grid grid-cols-3 gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
                <Stat label="This cycle" value={`${formatCount(eventsCount)} events`} />
                <Stat label="Overage" value={formatUsd(overageUsd)} />
                <Stat label="Bundle left" value={formatCount(remaining)} />
            </dl>

            <div className="flex items-center justify-between gap-3">
                <div>
                    <Label htmlFor="event-bundle-enabled">Enable hard cap</Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Reject events once overage hits the limit; new events return 202 with an
                        `events_capped` body.
                    </p>
                </div>
                <Switch
                    id="event-bundle-enabled"
                    name="enabled"
                    checked={enabled}
                    onCheckedChange={setEnabled}
                />
            </div>

            {enabled ? (
                <div className="space-y-2">
                    <Label htmlFor="event-bundle-cap">Hard cap (USD)</Label>
                    <Input
                        id="event-bundle-cap"
                        name="hardCapUsd"
                        type="number"
                        step="1"
                        min={MIN_CAP_USD}
                        max={MAX_CAP_USD}
                        value={capUsd}
                        onChange={(e) => setCapUsd(e.target.value)}
                        aria-invalid={state.fieldErrors?.hardCapUsd ? true : undefined}
                    />
                    <p className="text-xs text-muted-foreground">
                        Whole dollars. Events past this overage are rejected for the rest of the
                        cycle.
                    </p>
                    {state.fieldErrors?.hardCapUsd ? (
                        <p className="text-xs text-destructive">{state.fieldErrors.hardCapUsd}</p>
                    ) : null}
                </div>
            ) : null}

            <Button type="submit" disabled={pending || !validCap}>
                {pending ? "Saving…" : "Save"}
            </Button>
        </form>
    );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
    return (
        <div>
            <dt className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                {label}
            </dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">{value}</dd>
        </div>
    );
}
