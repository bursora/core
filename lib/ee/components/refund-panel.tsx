"use client";

/**
 * Money-back guarantee panel. Shown only while the workspace is inside
 * `refund_eligible_until`. Clicking the button opens a confirmation dialog
 * that fires `requestRefundAction`. Success cancels the subscription and
 * refunds every paid invoice; failure surfaces via a toast.
 */

import { requestRefundAction } from "../billing-actions";
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
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import type { ActionResult } from "@/lib/action-result";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface RefundPanelProps {
    readonly workspaceId: string;
    readonly eligibleUntil: Date;
    readonly canRequest: boolean;
}

const INITIAL: ActionResult = { ok: false };

const DAY_MS = 24 * 60 * 60 * 1000;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
});

export function RefundPanel({ workspaceId, eligibleUntil, canRequest }: RefundPanelProps) {
    const [state, formAction, isPending] = useActionState(requestRefundAction, INITIAL);
    const [open, setOpen] = useState(false);
    const lastError = useRef<string | null>(null);
    const lastOk = useRef(false);

    const daysRemaining = Math.max(
        0,
        Math.ceil(
            (eligibleUntil.getTime() -
                // eslint-disable-next-line react-hooks/purity -- countdown is informational; re-rendering with a fresh value is fine
                Date.now()) /
                DAY_MS,
        ),
    );

    useEffect(() => {
        const err = state.error ?? null;
        if (err && err !== lastError.current) {
            toast.error(err);
            lastError.current = err;
            setOpen(false);
        }
    }, [state.error]);

    useEffect(() => {
        if (state.ok && !lastOk.current) {
            lastOk.current = true;
            setOpen(false);
            toast.success("Refund issued. Your subscription has been canceled.");
        }
    }, [state.ok]);

    return (
        <DashboardSection label="Money-back guarantee">
            <p className="text-sm text-foreground">
                Refund eligible until {dateFormatter.format(eligibleUntil)} ·{" "}
                {daysRemaining === 1 ? "1 day" : `${daysRemaining} days`} remaining.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
                Cancels your subscription immediately and refunds every paid invoice. No questions
                asked.
            </p>
            {canRequest ? (
                <div className="mt-4">
                    <AlertDialog open={open} onOpenChange={setOpen}>
                        <AlertDialogTrigger asChild>
                            <Button type="button" variant="outline">
                                Request refund
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <form action={formAction}>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Request a full refund?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        We&apos;ll refund every paid invoice on this workspace and
                                        cancel your subscription right now. Service stops as soon as
                                        the refund clears.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <input type="hidden" name="workspaceId" value={workspaceId} />
                                <AlertDialogFooter>
                                    <AlertDialogCancel type="button" disabled={isPending}>
                                        Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction asChild>
                                        <Button type="submit" disabled={isPending}>
                                            {isPending ? "Refunding…" : "Confirm refund"}
                                        </Button>
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </form>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                    Only the workspace owner can request a refund.
                </p>
            )}
        </DashboardSection>
    );
}
