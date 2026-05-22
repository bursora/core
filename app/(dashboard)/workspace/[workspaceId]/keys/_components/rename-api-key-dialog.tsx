"use client";

import { renameApiKeyAction } from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ActionResult } from "@/lib/action-result";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

const INITIAL: ActionResult = { ok: false };

interface RenameApiKeyDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly keyId: string;
    readonly workspaceId: string;
    readonly currentName: string;
}

export function RenameApiKeyDialog({
    open,
    onOpenChange,
    keyId,
    workspaceId,
    currentName,
}: RenameApiKeyDialogProps) {
    const [state, formAction, pending] = useActionState<ActionResult, FormData>(
        renameApiKeyAction,
        INITIAL,
    );

    useEffect(() => {
        if (state.ok) {
            toast.success("Key renamed.");
            onOpenChange(false);
        } else if (state.error) {
            toast.error(state.error);
        }
    }, [state, onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <form action={formAction}>
                    <DialogHeader>
                        <DialogTitle>Rename API key</DialogTitle>
                        <DialogDescription>
                            Change the name shown in the dashboard. The key itself is unchanged.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4">
                        <Label htmlFor="rename-api-key-input">Name</Label>
                        <Input
                            id="rename-api-key-input"
                            name="name"
                            defaultValue={currentName}
                            autoFocus
                            required
                            maxLength={60}
                            minLength={1}
                            placeholder="e.g. production-backend"
                            aria-invalid={state.fieldErrors?.name ? true : undefined}
                        />
                        {state.fieldErrors?.name ? (
                            <p className="text-xs text-destructive">{state.fieldErrors.name}</p>
                        ) : null}
                    </div>
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input type="hidden" name="keyId" value={keyId} />
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={pending}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? "Saving…" : "Save"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
