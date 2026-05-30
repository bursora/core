"use server";

import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { workspaceIdFromForm } from "@/lib/actions/form-fields";
import { withWorkspace } from "@/lib/actions/with-workspace";
import { ValidationError, type BudgetMode, type Period, type ScopeType } from "@/lib/budgeting";
import { createBudget, deleteBudget, updateBudget } from "@/lib/budgeting/server";
import { buildWorkspacePath } from "@/lib/routes";
import { revalidatePath } from "next/cache";

const budgetsPath = (workspaceId: string) => buildWorkspacePath(workspaceId, "budgets");

const stringField = (form: FormData, name: string): string => String(form.get(name) ?? "");

const optionalScopeId = (form: FormData): string | null => {
    const raw = stringField(form, "scopeId").trim();
    return raw.length === 0 ? null : raw;
};

export const createBudgetAction = withWorkspace(
    async (_ctx, formData: FormData): Promise<ActionResult> => {
        const workspaceId = workspaceIdFromForm(formData);

        try {
            await createBudget({
                workspaceId,
                scopeType: stringField(formData, "scopeType") as ScopeType,
                scopeId: optionalScopeId(formData),
                period: stringField(formData, "period") as Period,
                amountUsd: stringField(formData, "amountUsd"),
                mode: stringField(formData, "mode") as BudgetMode,
            });
        } catch (err) {
            if (err instanceof ValidationError) {
                return actionFail(err.message, { [err.field]: err.message });
            }
            throw err;
        }

        revalidatePath(budgetsPath(workspaceId));
        return actionOk();
    },
    { getWorkspaceId: workspaceIdFromForm },
);

export const updateBudgetAction = withWorkspace(
    async (_ctx, formData: FormData): Promise<ActionResult> => {
        const workspaceId = workspaceIdFromForm(formData);
        const id = stringField(formData, "id");

        try {
            await updateBudget({
                id,
                workspaceId,
                patch: {
                    scopeType: stringField(formData, "scopeType") as ScopeType,
                    scopeId: optionalScopeId(formData),
                    period: stringField(formData, "period") as Period,
                    amountUsd: stringField(formData, "amountUsd"),
                    mode: stringField(formData, "mode") as BudgetMode,
                },
            });
        } catch (err) {
            if (err instanceof ValidationError) {
                return actionFail(err.message, { [err.field]: err.message });
            }
            throw err;
        }

        revalidatePath(budgetsPath(workspaceId));
        return actionOk();
    },
    { getWorkspaceId: workspaceIdFromForm },
);

export const deleteBudgetAction = withWorkspace(
    async (_ctx, formData: FormData): Promise<ActionResult> => {
        const workspaceId = workspaceIdFromForm(formData);
        const id = stringField(formData, "id");

        try {
            await deleteBudget({ id, workspaceId });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to delete budget.";
            return actionFail(message);
        }

        revalidatePath(budgetsPath(workspaceId));
        return actionOk();
    },
    { getWorkspaceId: workspaceIdFromForm },
);
