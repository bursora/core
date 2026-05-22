"use client";

import { renameWorkspaceAction } from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionResult } from "@/lib/action-result";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

const INITIAL: ActionResult = { ok: false };
const MAX_LENGTH = 80;

interface RenameWorkspaceFormProps {
    readonly workspaceId: string;
    readonly currentName: string;
}

export function RenameWorkspaceForm({ workspaceId, currentName }: RenameWorkspaceFormProps) {
    const [state, formAction, pending] = useActionState<ActionResult, FormData>(
        renameWorkspaceAction,
        INITIAL,
    );
    const [name, setName] = useState(currentName);

    useEffect(() => {
        if (state.ok) toast.success("Workspace renamed.");
        else if (state.error) toast.error(state.error);
    }, [state]);

    const dirty = name.trim().length > 0 && name.trim() !== currentName;

    return (
        <form action={formAction} className="space-y-3">
            <div className="space-y-2">
                <Label htmlFor="workspace-name">Name</Label>
                <Input
                    id="workspace-name"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={MAX_LENGTH}
                    minLength={1}
                    aria-invalid={state.fieldErrors?.name ? true : undefined}
                />
                {state.fieldErrors?.name ? (
                    <p className="text-xs text-destructive">{state.fieldErrors.name}</p>
                ) : null}
            </div>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <Button type="submit" disabled={pending || !dirty}>
                {pending ? "Saving…" : "Save"}
            </Button>
        </form>
    );
}
