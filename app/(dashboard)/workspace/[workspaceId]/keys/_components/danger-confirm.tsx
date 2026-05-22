"use client";

/**
 * Destructive confirmation dialog. Wraps a shadcn AlertDialog around a
 * single trigger button. The confirm action submits a server action via
 * useActionState; errors surface as a toast, success closes the dialog
 * and fires an optional success toast. Hidden inputs can be passed in
 * via the `fields` map.
 */

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
import type { ActionResult } from "@/lib/action-result";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

export type DangerConfirmState = ActionResult;

const INITIAL: DangerConfirmState = { ok: false };

interface DangerConfirmProps {
    readonly trigger: ReactNode;
    readonly title: string;
    readonly description: string;
    readonly confirmLabel: string;
    readonly successMessage?: string;
    readonly fields?: Readonly<Record<string, string>>;
    readonly action: (prev: DangerConfirmState, formData: FormData) => Promise<DangerConfirmState>;
    /** Fired before the server action runs so callers can apply optimistic UI. */
    readonly onOptimisticBegin?: () => void;
    /** Fired when the server reports failure so callers can roll back. */
    readonly onOptimisticRollback?: (error: string) => void;
}

export function DangerConfirm({
    trigger,
    title,
    description,
    confirmLabel,
    successMessage,
    fields,
    action,
    onOptimisticBegin,
    onOptimisticRollback,
}: DangerConfirmProps) {
    const wrappedAction = async (
        prev: DangerConfirmState,
        formData: FormData,
    ): Promise<DangerConfirmState> => {
        onOptimisticBegin?.();
        return action(prev, formData);
    };
    const [state, formAction, isPending] = useActionState(wrappedAction, INITIAL);
    const [open, setOpen] = useState(false);
    const lastError = useRef<string | null>(null);
    const lastOk = useRef(false);

    useEffect(() => {
        const err = state.error ?? null;
        if (err && err !== lastError.current) {
            toast.error(err);
            onOptimisticRollback?.(err);
            lastError.current = err;
        }
    }, [state.error, onOptimisticRollback]);

    useEffect(() => {
        if (state.ok && !lastOk.current) {
            lastOk.current = true;
            setOpen(false);
            if (successMessage) toast.success(successMessage);
        }
    }, [state.ok, successMessage]);

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <form action={formAction}>
                    {fields
                        ? Object.entries(fields).map(([name, value]) => (
                              <input key={name} type="hidden" name={name} value={value} />
                          ))
                        : null}
                    <AlertDialogFooter>
                        <AlertDialogCancel type="button" disabled={isPending}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                            <Button type="submit" variant="destructive" disabled={isPending}>
                                {isPending ? "Working…" : confirmLabel}
                            </Button>
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </form>
            </AlertDialogContent>
        </AlertDialog>
    );
}
