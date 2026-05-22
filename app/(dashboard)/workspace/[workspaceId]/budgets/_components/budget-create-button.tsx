"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import { Plus } from "lucide-react";
import { useState } from "react";
import { BudgetForm, type BudgetFormValues, type ScopeSuggestionsMap } from "./budget-form";

interface BudgetCreateButtonProps {
    readonly workspaceId: string;
    readonly createAction: (formData: FormData) => Promise<ActionResult>;
    readonly scopeSuggestions?: ScopeSuggestionsMap;
}

export function BudgetCreateButton({
    workspaceId,
    createAction,
    scopeSuggestions,
}: BudgetCreateButtonProps) {
    const [open, setOpen] = useState(false);

    const handle = async (values: BudgetFormValues): Promise<ActionResult> => {
        const fd = new FormData();
        fd.set("workspaceId", workspaceId);
        fd.set("scopeType", values.scopeType);
        fd.set("scopeId", values.scopeId);
        fd.set("period", values.period);
        fd.set("amountUsd", values.amountUsd);
        fd.set("mode", values.mode);
        const result = await createAction(fd);
        if (result.ok) setOpen(false);
        return result;
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm">
                    <Plus className="size-4" />
                    Add budget
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>New budget</DialogTitle>
                    <DialogDescription>
                        Define scope, period, amount, and enforcement mode. Changes apply within 1
                        minute.
                    </DialogDescription>
                </DialogHeader>
                <BudgetForm
                    action={handle}
                    submitLabel="Create budget"
                    {...(scopeSuggestions ? { scopeSuggestions } : {})}
                />
            </DialogContent>
        </Dialog>
    );
}
