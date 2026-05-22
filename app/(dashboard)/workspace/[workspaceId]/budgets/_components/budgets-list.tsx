"use client";

import { EmptyStateCard } from "@/components/ui/workspace/empty-state-card";
import { StatTile } from "@/components/ui/workspace/stat-tile";
import { useUrlParamCommit } from "@/components/ui/hooks/use-url-param-commit";
import type { ActionResult } from "@/lib/action-result";
import {
    MODES,
    SCOPE_TYPES,
    optimisticReducer,
    type BudgetMode,
    type BudgetStats,
    type OptimisticItem,
    type RawBudget,
    type ScopeType,
} from "@/lib/budgeting";
import { CircleDollarSign } from "lucide-react";
import { useMemo, useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import type { BudgetFormValues, ScopeSuggestionsMap } from "./budget-form";
import { BudgetRow } from "./budget-row";
import { MODE_META, SCOPE_META } from "./labels";

interface OptimisticBudget extends RawBudget, OptimisticItem {}

interface BudgetsListProps {
    readonly workspaceId: string;
    readonly budgets: readonly RawBudget[];
    readonly statsByBudget: Record<string, BudgetStats>;
    readonly activeMode: BudgetMode | null;
    readonly updateAction: (formData: FormData) => Promise<ActionResult>;
    readonly deleteAction: (formData: FormData) => Promise<ActionResult>;
    readonly scopeSuggestions?: ScopeSuggestionsMap;
}

function toUpdateFormData(workspaceId: string, values: BudgetFormValues, id: string): FormData {
    const fd = new FormData();
    fd.set("workspaceId", workspaceId);
    fd.set("id", id);
    fd.set("scopeType", values.scopeType);
    fd.set("scopeId", values.scopeId);
    fd.set("period", values.period);
    fd.set("amountUsd", values.amountUsd);
    fd.set("mode", values.mode);
    return fd;
}

const SCOPE_ORDER: Record<ScopeType, number> = SCOPE_TYPES.reduce(
    (acc, s, i) => ({ ...acc, [s]: i }),
    {} as Record<ScopeType, number>,
);

export function BudgetsList({
    workspaceId,
    budgets,
    statsByBudget,
    activeMode,
    updateAction,
    deleteAction,
    scopeSuggestions,
}: BudgetsListProps) {
    const initial = useMemo<readonly OptimisticBudget[]>(
        () => budgets.map((b) => ({ ...b, pending: "none" })),
        [budgets],
    );

    const [optimistic, dispatch] = useOptimistic(initial, optimisticReducer<OptimisticBudget>);
    const [, startTransition] = useTransition();
    const { commit } = useUrlParamCommit();

    const totalCounts = useMemo(() => {
        const c: Record<BudgetMode, number> = { notify: 0, throttle: 0, block: 0 };
        for (const b of optimistic) c[b.mode] += 1;
        return c;
    }, [optimistic]);

    const visible = useMemo(() => {
        const filtered =
            activeMode === null ? optimistic : optimistic.filter((b) => b.mode === activeMode);
        return [...filtered].sort((a, b) => {
            const order = SCOPE_ORDER[a.scopeType] - SCOPE_ORDER[b.scopeType];
            if (order !== 0) return order;
            return Number(b.amountUsd) - Number(a.amountUsd);
        });
    }, [optimistic, activeMode]);

    const grouped = useMemo(() => {
        const groups: Record<ScopeType, OptimisticBudget[]> = {
            workspace: [],
            tenant: [],
            agent: [],
            workflow: [],
        };
        for (const b of visible) groups[b.scopeType].push(b);
        return groups;
    }, [visible]);

    const toggleMode = (mode: BudgetMode): void => {
        if (activeMode === mode) commit({ delete: ["mode"] });
        else commit({ set: { mode } });
    };

    const onUpdate =
        (id: string, close: () => void) =>
        async (values: BudgetFormValues): Promise<ActionResult> => {
            startTransition(() => {
                dispatch({
                    kind: "update",
                    id,
                    patch: {
                        scopeType: values.scopeType,
                        scopeId: values.scopeId || null,
                        period: values.period,
                        amountUsd: values.amountUsd,
                        mode: values.mode,
                    },
                });
            });
            close();
            const result = await updateAction(toUpdateFormData(workspaceId, values, id));
            if (!result.ok) toast.error(result.error ?? "Failed to update budget.");
            return result;
        };

    const onDelete = async (id: string): Promise<void> => {
        startTransition(() => {
            dispatch({ kind: "remove", id });
        });
        const fd = new FormData();
        fd.set("workspaceId", workspaceId);
        fd.set("id", id);
        const result = await deleteAction(fd);
        if (!result.ok) {
            startTransition(() => {
                dispatch({ kind: "rollback-remove", id });
            });
            toast.error(result.error ?? "Failed to delete budget.");
        }
    };

    if (optimistic.length === 0) {
        return (
            <EmptyStateCard
                icon={CircleDollarSign}
                title="No budgets yet"
                description="Add a budget to enforce spend limits on this workspace or scoped to a specific tenant, agent, or workflow."
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
                {MODES.map((mode) => (
                    <StatTile
                        key={mode}
                        label={MODE_META[mode].label}
                        value={totalCounts[mode]}
                        tone={MODE_TONE[mode]}
                        pressed={activeMode === mode}
                        onClick={() => toggleMode(mode)}
                    />
                ))}
            </div>

            {visible.length === 0 ? (
                <p className="rounded-[8px] border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                    No {activeMode} budgets. Clear the filter to see all {optimistic.length}.
                </p>
            ) : (
                <div className="space-y-6">
                    {SCOPE_TYPES.map((scope) => {
                        const rows = grouped[scope];
                        if (rows.length === 0) return null;
                        const ScopeIcon = SCOPE_META[scope].Icon;
                        return (
                            <section
                                key={scope}
                                aria-labelledby={`scope-${scope}`}
                                className="space-y-2"
                            >
                                <h3
                                    id={`scope-${scope}`}
                                    className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70"
                                >
                                    <ScopeIcon className="size-3.5" />
                                    {SCOPE_META[scope].label}
                                    <span className="ml-1 text-muted-foreground/50">
                                        ({rows.length})
                                    </span>
                                </h3>
                                <ul className="space-y-2">
                                    {rows.map((b) => (
                                        <BudgetRow
                                            key={b.id}
                                            workspaceId={workspaceId}
                                            budget={b}
                                            stats={statsByBudget[b.id]}
                                            pending={b.pending}
                                            onUpdate={onUpdate}
                                            onDelete={onDelete}
                                            {...(scopeSuggestions ? { scopeSuggestions } : {})}
                                        />
                                    ))}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const MODE_TONE = {
    notify: "muted",
    throttle: "warning",
    block: "destructive",
} as const satisfies Record<BudgetMode, "muted" | "warning" | "destructive">;
