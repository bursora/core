"use client";

import type {
    LoadMoreBlocksInput,
    LoadMoreBlocksResult,
} from "@/app/(dashboard)/workspace/[workspaceId]/budgets/[budgetId]/actions";
import { Button } from "@/components/ui/button";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { formatDateTime, formatPreciseUsd } from "@/lib/format";
import type { BlockedEventRow } from "@/lib/metering";
import { ProviderIcon, providerLabel } from "@/lib/providers";
import { useState, useTransition } from "react";

interface BlocksTabProps {
    readonly workspaceId: string;
    readonly budgetId: string;
    readonly initialItems: readonly BlockedEventRow[];
    readonly initialNextCursor: string | null;
    readonly loadMore: (input: LoadMoreBlocksInput) => Promise<LoadMoreBlocksResult>;
}

export function BlocksTab({
    workspaceId,
    budgetId,
    initialItems,
    initialNextCursor,
    loadMore,
}: BlocksTabProps) {
    const [items, setItems] = useState<readonly BlockedEventRow[]>(initialItems);
    const [cursor, setCursor] = useState<string | null>(initialNextCursor);
    const [isPending, startTransition] = useTransition();

    const onLoadMore = () => {
        if (cursor === null) return;
        startTransition(async () => {
            const next = await loadMore({ workspaceId, budgetId, cursor });
            setItems((prev) => [...prev, ...next.items]);
            setCursor(next.nextCursor);
        });
    };

    if (items.length === 0) {
        return (
            <DashboardSection label="Blocks" sublabel="current period">
                <p className="py-6 text-center text-sm text-muted-foreground">
                    Nothing&apos;s been blocked by this budget this period.
                </p>
            </DashboardSection>
        );
    }

    return (
        <DashboardSection
            label="Blocks"
            sublabel="current period · newest first"
            bodyClassName="-mx-5"
        >
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                            <th className="px-5 py-2 font-medium">Time</th>
                            <th className="px-3 py-2 font-medium">Tenant</th>
                            <th className="px-3 py-2 font-medium">Agent</th>
                            <th className="px-3 py-2 font-medium">Workflow</th>
                            <th className="px-3 py-2 font-medium">Intended call</th>
                            <th className="px-5 py-2 font-medium">Reason</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {items.map((row, idx) => (
                            <tr key={`${row.ts}-${idx}`} className="text-foreground">
                                <td className="px-5 py-2 font-mono text-xs tabular-nums">
                                    <time dateTime={row.ts} title={row.ts}>
                                        {formatDateTime(new Date(row.ts))}
                                    </time>
                                </td>
                                <TagCell value={row.tenantId} />
                                <TagCell value={row.agentId} />
                                <TagCell value={row.workflowId} />
                                <IntendedCell
                                    provider={row.intendedProvider}
                                    model={row.intendedModel}
                                />
                                <ReasonCell value={row.blockReason} />
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {cursor !== null ? (
                <div className="border-t px-5 py-3">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={onLoadMore}
                        disabled={isPending}
                    >
                        {isPending ? "Loading…" : "Load older"}
                    </Button>
                </div>
            ) : null}
        </DashboardSection>
    );
}

interface TagCellProps {
    readonly value: string | null;
}

function TagCell({ value }: TagCellProps) {
    if (value === null) {
        return <td className="px-3 py-2 text-muted-foreground">—</td>;
    }
    return <td className="px-3 py-2 font-mono text-xs tabular-nums">{value}</td>;
}

interface IntendedCellProps {
    readonly provider: string | null;
    readonly model: string | null;
}

function IntendedCell({ provider, model }: IntendedCellProps) {
    if (provider === null && model === null) {
        return <td className="px-3 py-2 text-muted-foreground">—</td>;
    }
    return (
        <td className="px-3 py-2 text-xs">
            <span className="inline-flex items-center gap-2">
                {model !== null ? <span className="font-mono">{model}</span> : null}
                {provider !== null ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <ProviderIcon id={provider} className="size-4 shrink-0" />
                        <span>{providerLabel(provider)}</span>
                    </span>
                ) : null}
            </span>
        </td>
    );
}

interface ReasonCellProps {
    readonly value: string | null;
}

function ReasonCell({ value }: ReasonCellProps) {
    if (value === null) return <td className="px-5 py-2 text-muted-foreground">—</td>;
    return (
        <td className="px-5 py-2 font-mono text-xs" title={value}>
            {humanizeReason(value)}
        </td>
    );
}

// Translates the protocol reason string emitted by `evaluateBudget`
// (e.g. `workspace:*:over:1.8/2`) into a one-liner. Falls back to the raw
// string when the shape is unrecognized.
function humanizeReason(raw: string): string {
    const [scopeType, scopeId, marker, numbers] = raw.split(":");
    if (marker !== "over" || scopeType === undefined || scopeId === undefined) return raw;
    const [used, limit] = (numbers ?? "").split("/");
    const usedN = Number.parseFloat(used ?? "");
    const limitN = Number.parseFloat(limit ?? "");
    if (!Number.isFinite(usedN) || !Number.isFinite(limitN)) return raw;
    const scope = scopeId === "*" ? scopeType : `${scopeType} ${scopeId}`;
    return `${scope} over: ${formatPreciseUsd(usedN)} / ${formatPreciseUsd(limitN)}`;
}
