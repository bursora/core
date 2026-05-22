"use client";

import { formatCostPerCall, formatCount, formatUsd } from "@/lib/format";
import { UNTAGGED, type MeteringStatusFilter, type TopSpender } from "@/lib/metering";
import { ModelTag } from "@/lib/models";
import { buildWorkspacePath } from "@/lib/routes";
import { computeSharePercent } from "@/lib/spend-share";
import type { Facet } from "@/lib/spend-types";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ShareBar } from "../share-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../table";
import { StatusTag } from "../workspace/status-tag";

type SortKey = "share" | "calls" | "perCall" | "cost" | "blocked";
type SortDir = "asc" | "desc";

const MODEL_FACET: Facet = "model";

interface TopSpendersTableProps {
    rows: readonly TopSpender[];
    totalUsd: string;
    workspaceId: string;
    facet: Facet;
    from: Date;
    to: Date;
    /** Defaults to `'ok'`. Drives which sort key starts active and whether
     *  the Blocked column renders. */
    status?: MeteringStatusFilter;
    /** Slug → provider, resolved from pricing. Required when `facet === 'model'`;
     *  missing entries render as "Unknown". */
    modelProviders?: Readonly<Record<string, string>>;
    /** When false, rows are not clickable (no navigation, no cursor-pointer,
     *  no aria-label). Defaults to true. The landing-page composition passes
     *  false so visitors aren't sent to auth-gated routes. */
    linkScope?: boolean;
}

export function TopSpendersTable({
    rows,
    totalUsd,
    workspaceId,
    facet,
    from,
    to,
    status = "ok",
    modelProviders = {},
    linkScope = true,
}: TopSpendersTableProps) {
    const router = useRouter();
    const showBlockedColumn = status !== "ok";
    const initialSortKey: SortKey = status === "blocked" ? "blocked" : "cost";
    const [sortKey, setSortKey] = useState<SortKey>(initialSortKey);
    const [sortDir, setSortDir] = useState<SortDir>("desc");

    const sorted = useMemo(
        () => sortRows(rows, totalUsd, sortKey, sortDir),
        [rows, totalUsd, sortKey, sortDir],
    );

    if (rows.length === 0) {
        return <p className="px-5 text-sm text-muted-foreground">No spenders in this range.</p>;
    }

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir(key === "perCall" ? "asc" : "desc");
        }
    };

    const goScope = (tag: string) => {
        if (tag === UNTAGGED || facet === MODEL_FACET) return;
        router.push(
            buildWorkspacePath(workspaceId, "spend", {
                facet,
                from: from.toISOString(),
                to: to.toISOString(),
                scope_id: tag,
            }),
        );
    };

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Tag</TableHead>
                    <SortHeader
                        label="Share"
                        sortKey="share"
                        active={sortKey}
                        dir={sortDir}
                        onClick={handleSort}
                        className="w-[40%]"
                    />
                    <SortHeader
                        label="Calls"
                        sortKey="calls"
                        active={sortKey}
                        dir={sortDir}
                        onClick={handleSort}
                        className="text-right"
                    />
                    <SortHeader
                        label="$/call"
                        sortKey="perCall"
                        active={sortKey}
                        dir={sortDir}
                        onClick={handleSort}
                        className="text-right"
                    />
                    <SortHeader
                        label="Cost (USD)"
                        sortKey="cost"
                        active={sortKey}
                        dir={sortDir}
                        onClick={handleSort}
                        className="text-right"
                    />
                    {showBlockedColumn ? (
                        <SortHeader
                            label="Blocked"
                            sortKey="blocked"
                            active={sortKey}
                            dir={sortDir}
                            onClick={handleSort}
                            className="text-right"
                        />
                    ) : null}
                </TableRow>
            </TableHeader>
            <TableBody>
                {sorted.map((r) => {
                    const pct = computeSharePercent(r.costUsd, totalUsd);
                    const costPerCall = formatCostPerCall(r.costUsd, r.callCount) ?? "—";
                    const clickable = linkScope && r.tag !== UNTAGGED && facet !== MODEL_FACET;
                    return (
                        <TableRow
                            key={r.tag}
                            onClick={clickable ? () => goScope(r.tag) : undefined}
                            className={
                                clickable
                                    ? "cursor-pointer transition-colors hover:bg-muted/50"
                                    : undefined
                            }
                            aria-label={clickable ? `Filter spend to ${facet} ${r.tag}` : undefined}
                        >
                            <TableCell>
                                {r.tag === UNTAGGED ? (
                                    <StatusTag tone="muted" variant="pill">
                                        untagged
                                    </StatusTag>
                                ) : facet === MODEL_FACET ? (
                                    <ModelTag
                                        slug={r.tag}
                                        provider={modelProviders[r.tag] ?? "unknown"}
                                    />
                                ) : (
                                    <code className="font-mono text-sm">{r.tag}</code>
                                )}
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    <ShareBar percent={pct} ariaLabel={`${pct}% of total`} />
                                    <span className="w-10 text-xs tabular-nums text-muted-foreground">
                                        {pct}%
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {formatCount(r.callCount)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{costPerCall}</TableCell>
                            <TableCell className="text-right tabular-nums">
                                {formatUsd(r.costUsd)}
                            </TableCell>
                            {showBlockedColumn ? (
                                <TableCell className="text-right tabular-nums">
                                    {formatCount(r.blockedCount)}
                                </TableCell>
                            ) : null}
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}

interface SortHeaderProps {
    readonly label: string;
    readonly sortKey: SortKey;
    readonly active: SortKey;
    readonly dir: SortDir;
    readonly onClick: (key: SortKey) => void;
    readonly className?: string;
}

function SortHeader({ label, sortKey, active, dir, onClick, className }: SortHeaderProps) {
    const isActive = active === sortKey;
    const Icon = dir === "asc" ? ArrowUp : ArrowDown;
    return (
        <TableHead className={className} aria-sort={isActive ? ariaSort(dir) : "none"}>
            <button
                type="button"
                onClick={() => onClick(sortKey)}
                className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide ${
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
            >
                {label}
                {isActive ? <Icon className="h-3 w-3" aria-hidden /> : null}
            </button>
        </TableHead>
    );
}

function ariaSort(dir: SortDir): "ascending" | "descending" {
    return dir === "asc" ? "ascending" : "descending";
}

function sortRows(
    rows: readonly TopSpender[],
    totalUsd: string,
    key: SortKey,
    dir: SortDir,
): readonly TopSpender[] {
    const factor = dir === "asc" ? 1 : -1;
    return [...rows].sort(
        (a, b) => factor * (sortValue(a, totalUsd, key) - sortValue(b, totalUsd, key)),
    );
}

function sortValue(row: TopSpender, totalUsd: string, key: SortKey): number {
    if (key === "calls") return row.callCount;
    if (key === "cost") return Number.parseFloat(row.costUsd);
    if (key === "blocked") return row.blockedCount;
    if (key === "share") return computeSharePercent(row.costUsd, totalUsd);
    if (row.callCount <= 0) return 0;
    return Number.parseFloat(row.costUsd) / row.callCount;
}
