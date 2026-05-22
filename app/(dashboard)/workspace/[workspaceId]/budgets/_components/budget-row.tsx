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
import { ShareBar } from "@/components/ui/share-bar";
import type { ActionResult } from "@/lib/action-result";
import {
    buildBudgetSpendHref,
    pendingRowClass,
    projectEndOfPeriod,
    type BudgetMode,
    type BudgetStats,
    type PendingState,
    type RawBudget,
} from "@/lib/budgeting";
import { formatCount, formatPercent, formatTokens, formatUsd } from "@/lib/format";
import { buildWorkspacePath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ExternalLink, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { BudgetFormValues, ScopeSuggestionsMap } from "./budget-form";
import { BudgetHeader } from "./budget-header";
import { EditBudgetDialog } from "./edit-budget-dialog";

const FILL_BY_MODE = {
    notify: "bg-muted-foreground/40",
    throttle: "bg-warning",
    block: "bg-destructive",
} as const satisfies Record<BudgetMode, string>;

const OVER_FILL = "bg-destructive";

interface BudgetRowProps {
    readonly workspaceId: string;
    readonly budget: RawBudget;
    readonly stats: BudgetStats | undefined;
    readonly onUpdate: (
        id: string,
        close: () => void,
    ) => (values: BudgetFormValues) => Promise<ActionResult>;
    readonly onDelete: (id: string) => Promise<void>;
    readonly pending?: PendingState;
    readonly scopeSuggestions?: ScopeSuggestionsMap;
}

export function BudgetRow({
    workspaceId,
    budget,
    stats,
    onUpdate,
    onDelete,
    pending = "none",
    scopeSuggestions,
}: BudgetRowProps) {
    const [editing, setEditing] = useState(false);
    const [deletePending, startDelete] = useTransition();
    const isPending = pending !== "none";

    const limit = Number(budget.amountUsd);
    const usedUsd = stats?.usedUsd ?? 0;
    const ratio = limit > 0 ? usedUsd / limit : 0;
    const percent = ratio * 100;
    const isOver = ratio >= 1;
    const fillClass = isOver ? OVER_FILL : FILL_BY_MODE[budget.mode];

    const projection = stats ? projectEndOfPeriod(stats, usedUsd) : null;
    const projectedRatio = projection !== null && limit > 0 ? projection / limit : null;
    const willOver = projectedRatio !== null && projectedRatio > 1;

    const spendHref = buildBudgetSpendHref(workspaceId, budget, stats);
    const detailHref = buildWorkspacePath(workspaceId, `budgets/${budget.id}`);

    return (
        <li
            id={`budget-${budget.id}`}
            className={pendingRowClass(pending)}
            aria-busy={isPending || undefined}
        >
            <div className="relative flex flex-col gap-3 rounded-[8px] border border-border bg-background p-4 hover:border-foreground/20">
                <Link
                    href={detailHref}
                    aria-label={`Open budget ${budget.scopeId ?? budget.scopeType}`}
                    className="absolute inset-0 z-0 rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                <div className="pointer-events-none relative z-10 flex flex-wrap items-center justify-between gap-2">
                    <BudgetHeader budget={budget} stats={stats} />
                    <div className="pointer-events-auto flex items-center gap-1">
                        <Button asChild variant="ghost" size="icon-sm">
                            <Link href={detailHref} aria-label={`Open budget ${budget.id}`}>
                                <ExternalLink className="size-4 text-muted-foreground" />
                            </Link>
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit budget ${budget.id}`}
                            onClick={() => setEditing(true)}
                        >
                            <Pencil className="size-4 text-muted-foreground" />
                        </Button>
                        <DeleteButton
                            budget={budget}
                            disabled={deletePending || isPending}
                            onConfirm={() => {
                                startDelete(async () => {
                                    await onDelete(budget.id);
                                });
                            }}
                        />
                    </div>
                </div>

                <div className="pointer-events-none relative z-0 space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 font-mono text-sm tabular-nums">
                        <span>
                            <span className="font-semibold">{formatUsd(usedUsd)}</span>
                            <span className="text-muted-foreground"> / {formatUsd(limit)}</span>
                        </span>
                        <span
                            className={cn(
                                "text-xs font-medium",
                                isOver ? "text-destructive" : "text-muted-foreground",
                            )}
                        >
                            {formatPercent(Math.min(ratio, 9.99))}
                            {isOver ? " over" : ""}
                        </span>
                    </div>
                    <ShareBar
                        percent={percent}
                        fillClassName={fillClass}
                        ariaLabel={`${budget.scopeType} budget usage`}
                        className="h-1.5"
                    />
                </div>

                <div className="pointer-events-none relative z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>
                            <span className="font-medium tabular-nums text-foreground">
                                {formatCount(stats?.calls ?? 0)}
                            </span>{" "}
                            calls
                        </span>
                        <span aria-hidden>·</span>
                        <span>
                            <span className="font-medium tabular-nums text-foreground">
                                {formatTokens(stats?.tokens ?? 0)}
                            </span>{" "}
                            tokens
                        </span>
                        {stats?.topModel ? (
                            <>
                                <span aria-hidden>·</span>
                                <span>
                                    <span className="font-mono text-foreground">
                                        {stats.topModel.model}
                                    </span>{" "}
                                    ({formatPercent(stats.topModel.share)})
                                </span>
                            </>
                        ) : null}
                        {projection !== null ? (
                            <>
                                <span aria-hidden>·</span>
                                <span className={cn(willOver && "text-destructive")}>
                                    projected{" "}
                                    <span className="font-medium tabular-nums">
                                        {formatUsd(Math.round(projection))}
                                    </span>
                                </span>
                            </>
                        ) : null}
                    </div>
                    <Link
                        href={spendHref}
                        className="pointer-events-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                        View in spend
                        <ArrowUpRight className="size-3" />
                    </Link>
                </div>
            </div>

            <EditBudgetDialog
                open={editing}
                onOpenChange={setEditing}
                budget={budget}
                action={onUpdate(budget.id, () => setEditing(false))}
                {...(scopeSuggestions ? { scopeSuggestions } : {})}
            />
        </li>
    );
}

function DeleteButton({
    budget,
    disabled,
    onConfirm,
}: {
    budget: RawBudget;
    disabled: boolean;
    onConfirm: () => void;
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete budget ${budget.id}`}
                    disabled={disabled}
                >
                    <Trash2 className="size-4 text-muted-foreground" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete this budget?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This removes the {budget.period} {budget.mode} budget for {budget.scopeType}
                        {budget.scopeId ? ` ${budget.scopeId}` : ""}. This cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={onConfirm}>
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
