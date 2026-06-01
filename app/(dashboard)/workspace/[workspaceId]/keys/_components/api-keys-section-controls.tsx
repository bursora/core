"use client";

/**
 * Issue-key dialog: collects a human-readable name before posting to the
 * server action. The name is required so the dashboard list stays scannable
 * without showing raw key ids.
 */

import { issueApiKeyAction } from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildWorkspacePath } from "@/lib/routes";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface IssueApiKeyButtonProps {
    readonly workspaceId: string;
    /** Open the dialog on mount, then strip the triggering query param. */
    readonly autoOpen: boolean;
}

export function IssueApiKeyButton({ workspaceId, autoOpen }: IssueApiKeyButtonProps) {
    const [open, setOpen] = useState(autoOpen);
    const router = useRouter();

    useEffect(() => {
        if (autoOpen) router.replace(buildWorkspacePath(workspaceId, "keys"));
    }, [autoOpen, router, workspaceId]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button type="button">Issue new key</Button>
            </DialogTrigger>
            <DialogContent>
                <form action={issueApiKeyAction}>
                    <DialogHeader>
                        <DialogTitle>Issue new API key</DialogTitle>
                        <DialogDescription>
                            Give the key a short name so you can recognize it later. You can reveal
                            and copy the secret any time from the list.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4">
                        <Label htmlFor="api-key-name">Name</Label>
                        <Input
                            id="api-key-name"
                            name="name"
                            autoFocus
                            required
                            maxLength={60}
                            minLength={1}
                            placeholder="e.g. production-backend"
                        />
                    </div>
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit">Create key</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
