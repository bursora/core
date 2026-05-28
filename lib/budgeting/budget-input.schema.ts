/**
 * BudgetInputSchema — single Zod source of truth for budget dashboard input.
 *
 * Both `createBudgetUseCase` and `updateBudgetUseCase` validate against this
 * schema. The dashboard form is the only ingress; the SDK has read-only
 * access to budgets, so writes always pass through here.
 *
 * `amountUsd` is a string because the form posts it as a string and the
 * domain stores it as a string (Decimal-safe). The refinement asserts it
 * parses to a finite, non-negative number.
 *
 * The scope pair-check (workspace → scopeId null; tenant/agent/workflow →
 * non-empty scopeId) lives in a superRefine so the issue is reported on
 * `path: ["scopeId"]` regardless of which field the caller intended.
 */

import { z } from "zod";
import { MODES, SCOPE_TYPES } from "./budget";
import { PERIODS } from "./period";

export const BudgetInputSchema = z
    .object({
        scopeType: z.enum(SCOPE_TYPES),
        scopeId: z.string().nullable(),
        period: z.enum(PERIODS),
        mode: z.enum(MODES),
        amountUsd: z.string().refine((s) => {
            const n = Number.parseFloat(s);
            return Number.isFinite(n) && n >= 0;
        }, "amountUsd must be a non-negative number"),
    })
    .superRefine((input, ctx) => {
        if (input.scopeType === "workspace") {
            if (input.scopeId !== null) {
                ctx.addIssue({
                    code: "custom",
                    path: ["scopeId"],
                    message: "workspace scope must have null scopeId",
                });
            }
            return;
        }
        if (input.scopeId === null || input.scopeId.length === 0) {
            ctx.addIssue({
                code: "custom",
                path: ["scopeId"],
                message: `${input.scopeType} scope requires a non-empty scopeId`,
            });
        }
    });

export type BudgetInput = z.infer<typeof BudgetInputSchema>;
