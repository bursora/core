"use client";

import { setWorkspaceEnvironmentAction } from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionResult } from "@/lib/action-result";
import { useActionState, useEffect, useId, useState } from "react";
import { toast } from "sonner";

const INITIAL: ActionResult = { ok: false };
const MAX_LENGTH = 40;
const ENVIRONMENT_SUGGESTIONS = ["prod", "staging", "dev"] as const;

interface EnvironmentFormProps {
    readonly workspaceId: string;
    readonly currentEnvironment: string;
}

export function EnvironmentForm({ workspaceId, currentEnvironment }: EnvironmentFormProps) {
    const [state, formAction, pending] = useActionState<ActionResult, FormData>(
        setWorkspaceEnvironmentAction,
        INITIAL,
    );
    const [environment, setEnvironment] = useState(currentEnvironment);
    const listId = useId();

    useEffect(() => {
        if (state.ok) toast.success("Environment updated.");
        else if (state.error) toast.error(state.error);
    }, [state]);

    const dirty = environment.trim().length > 0 && environment.trim() !== currentEnvironment;

    return (
        <form action={formAction} className="space-y-3">
            <div className="space-y-2">
                <Label htmlFor="workspace-environment">Environment</Label>
                <Input
                    id="workspace-environment"
                    name="environment"
                    list={listId}
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    required
                    maxLength={MAX_LENGTH}
                    minLength={1}
                    aria-invalid={state.fieldErrors?.environment ? true : undefined}
                />
                <datalist id={listId}>
                    {ENVIRONMENT_SUGGESTIONS.map((opt) => (
                        <option key={opt} value={opt} />
                    ))}
                </datalist>
                {state.fieldErrors?.environment ? (
                    <p className="text-xs text-destructive">{state.fieldErrors.environment}</p>
                ) : null}
            </div>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <Button type="submit" disabled={pending || !dirty}>
                {pending ? "Saving…" : "Save"}
            </Button>
        </form>
    );
}
