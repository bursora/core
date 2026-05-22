"use client";

import { deleteWorkspaceAction } from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface DeleteWorkspaceDialogProps {
    readonly workspaceId: string;
    readonly workspaceName: string;
}

export function DeleteWorkspaceDialog({ workspaceId, workspaceName }: DeleteWorkspaceDialogProps) {
    const [confirmation, setConfirmation] = useState("");
    const matches = confirmation === workspaceName;

    return (
        <AlertDialog
            onOpenChange={(open) => {
                if (!open) setConfirmation("");
            }}
        >
            <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive">
                    Delete workspace
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <form action={deleteWorkspaceAction}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this workspace?</AlertDialogTitle>
                        <AlertDialogDescription>
                            All members, API keys, budgets, pricing overrides, alert channels, and
                            usage history will be permanently deleted. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2 py-4">
                        <Label htmlFor="confirm-workspace-name">
                            Type{" "}
                            <code className="rounded bg-muted px-1 font-mono text-xs">
                                {workspaceName}
                            </code>{" "}
                            to confirm.
                        </Label>
                        <Input
                            id="confirm-workspace-name"
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            autoComplete="off"
                        />
                    </div>
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <AlertDialogFooter>
                        <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" type="submit" disabled={!matches}>
                            Delete workspace
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </form>
            </AlertDialogContent>
        </AlertDialog>
    );
}
