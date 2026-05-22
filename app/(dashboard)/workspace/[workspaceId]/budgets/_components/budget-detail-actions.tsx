"use client";

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
import type { RawBudget } from "@/lib/budgeting";
import { buildWorkspacePath } from "@/lib/routes";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { BudgetFormValues, ScopeSuggestionsMap } from "./budget-form";
import { EditBudgetDialog } from "./edit-budget-dialog";

interface BudgetDetailActionsProps {
    readonly workspaceId: string;
    readonly budget: RawBudget;
    readonly updateAction: (formData: FormData) => Promise<ActionResult>;
    readonly deleteAction: (formData: FormData) => Promise<ActionResult>;
    readonly scopeSuggestions?: ScopeSuggestionsMap;
}

export function BudgetDetailActions({
    workspaceId,
    budget,
    updateAction,
    deleteAction,
    scopeSuggestions,
}: BudgetDetailActionsProps) {
    const [editing, setEditing] = useState(false);
    const [deletePending, startDelete] = useTransition();
    const router = useRouter();

    const onUpdate = async (values: BudgetFormValues): Promise<ActionResult> => {
        const fd = new FormData();
        fd.set("workspaceId", workspaceId);
        fd.set("id", budget.id);
        fd.set("scopeType", values.scopeType);
        fd.set("scopeId", values.scopeId);
        fd.set("period", values.period);
        fd.set("amountUsd", values.amountUsd);
        fd.set("mode", values.mode);
        const result = await updateAction(fd);
        if (result.ok) {
            setEditing(false);
            router.refresh();
        } else {
            toast.error(result.error ?? "Failed to update budget.");
        }
        return result;
    };

    const onConfirmDelete = (): void => {
        startDelete(async () => {
            const fd = new FormData();
            fd.set("workspaceId", workspaceId);
            fd.set("id", budget.id);
            const result = await deleteAction(fd);
            if (!result.ok) {
                toast.error(result.error ?? "Failed to delete budget.");
                return;
            }
            router.push(buildWorkspacePath(workspaceId, "budgets"));
        });
    };

    return (
        <div className="flex items-center gap-2">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(true)}
                aria-label={`Edit budget ${budget.id}`}
            >
                <Pencil className="size-4 text-muted-foreground" />
                <span className="ml-1.5">Edit</span>
            </Button>
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={deletePending}
                        aria-label={`Delete budget ${budget.id}`}
                    >
                        <Trash2 className="size-4 text-muted-foreground" />
                        <span className="ml-1.5">Delete</span>
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this budget?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the {budget.period} {budget.mode} budget for{" "}
                            {budget.scopeType}
                            {budget.scopeId ? ` ${budget.scopeId}` : ""}. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={onConfirmDelete}>
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <EditBudgetDialog
                open={editing}
                onOpenChange={setEditing}
                budget={budget}
                action={onUpdate}
                {...(scopeSuggestions ? { scopeSuggestions } : {})}
            />
        </div>
    );
}
