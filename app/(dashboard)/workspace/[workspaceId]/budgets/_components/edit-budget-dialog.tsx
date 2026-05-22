"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import type { RawBudget } from "@/lib/budgeting";
import { BudgetForm, type BudgetFormValues, type ScopeSuggestionsMap } from "./budget-form";

interface EditBudgetDialogProps {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly budget: RawBudget;
    readonly action: (values: BudgetFormValues) => Promise<ActionResult>;
    readonly scopeSuggestions?: ScopeSuggestionsMap;
}

export function EditBudgetDialog({
    open,
    onOpenChange,
    budget,
    action,
    scopeSuggestions,
}: EditBudgetDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Edit budget</DialogTitle>
                    <DialogDescription>
                        Update scope, period, amount, or mode. Changes apply within 1 minute.
                    </DialogDescription>
                </DialogHeader>
                <BudgetForm
                    action={action}
                    initial={{
                        scopeType: budget.scopeType,
                        scopeId: budget.scopeId,
                        period: budget.period,
                        amountUsd: budget.amountUsd,
                        mode: budget.mode,
                    }}
                    submitLabel="Save changes"
                    {...(scopeSuggestions ? { scopeSuggestions } : {})}
                />
            </DialogContent>
        </Dialog>
    );
}
