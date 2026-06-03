"use client";

import { deletePricingOverrideAction } from "@/app/(dashboard)/workspace/[workspaceId]/settings/actions";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { FacetedFilter, type FacetedFilterOption } from "@/components/ui/filters/faceted-filter";
import { useTimeZone } from "@/components/ui/hooks/use-time-zone";
import { useUrlParamCommit } from "@/components/ui/hooks/use-url-param-commit";
import { Input } from "@/components/ui/input";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { EmptyStateCard } from "@/components/ui/workspace/empty-state-card";
import { StatTile } from "@/components/ui/workspace/stat-tile";
import { StatusTag, type StatusTagTone } from "@/components/ui/workspace/status-tag";
import { formatDateTime, formatPreciseUsd } from "@/lib/format";
import { decorateProviderOptions, ProviderIcon, providerLabel } from "@/lib/providers";
import { cn } from "@/lib/utils";
import {
    CalendarClock,
    CircleDollarSign,
    Pencil,
    Plus,
    RotateCcw,
    Search,
    SearchX,
    Server,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PricingOverrideForm } from "./pricing-override-form";
import {
    pageWindow,
    parsePricingSearch,
    PRICING_PARAMS,
    rowStatus,
    toEditInitialValues,
    type PageToken,
    type PricingRowCounts,
    type PricingRowView,
    type RowStatus,
    type SourceFilter,
} from "./pricing-panel-helpers";

interface Props {
    workspaceId: string;
    rows: ReadonlyArray<PricingRowView>;
    counts: PricingRowCounts;
    providers: readonly string[];
    total: number;
    page: number;
    pageCount: number;
}

const STATUS_TONE: Record<RowStatus, StatusTagTone> = {
    active: "success",
    scheduled: "info",
    expired: "muted",
};

const STATUS_LABEL: Record<RowStatus, string> = {
    active: "Active",
    scheduled: "Scheduled",
    expired: "Expired",
};

const STATUS_FILTER_OPTIONS: readonly FacetedFilterOption[] = (
    ["active", "scheduled", "expired"] as const
).map((v) => ({ value: v, label: STATUS_LABEL[v], count: 0 }));

const SOURCE_TONE: Record<PricingRowView["source"], StatusTagTone> = {
    global: "muted",
    override: "foreground",
};

const SOURCE_LABEL: Record<PricingRowView["source"], string> = {
    global: "Global",
    override: "Override",
};

function ProviderTag({ id, model }: { id: string; model?: string }) {
    const label = providerLabel(id);
    if (model === undefined) {
        return (
            <span className="flex items-center gap-2">
                <ProviderIcon id={id} className="size-4 shrink-0" />
                <span>{label}</span>
            </span>
        );
    }
    return (
        <div className="flex items-center gap-2">
            <ProviderIcon id={id} className="size-5 shrink-0" />
            <div className="flex flex-col">
                <span className="font-mono text-sm font-medium">{model}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
            </div>
        </div>
    );
}

function rowKey(row: PricingRowView): string {
    return row.overrideId ?? `global:${row.provider}|${row.model}|${row.region}`;
}

export function PricingOverridesPanel({
    workspaceId,
    rows,
    counts,
    providers,
    total,
    page,
    pageCount,
}: Props) {
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<PricingRowView | null>(null);

    const searchParams = useSearchParams();
    const parsed = useMemo(
        () => parsePricingSearch(new URLSearchParams(searchParams.toString())),
        [searchParams],
    );
    const { commit } = useUrlParamCommit();
    const commitRef = useRef(commit);
    useEffect(() => {
        commitRef.current = commit;
    });

    // Local input drives a debounced commit to the URL `pricing_q`, so each
    // keystroke doesn't push a navigation. Seeded once from the URL (deep links
    // and refresh); the reset handler clears it back.
    const [search, setSearch] = useState(parsed.search);
    useEffect(() => {
        if (search === parsed.search) return;
        const t = setTimeout(() => {
            const v = search.trim();
            commitRef.current(
                v === ""
                    ? { delete: [PRICING_PARAMS.search, PRICING_PARAMS.page] }
                    : { set: { [PRICING_PARAMS.search]: v }, delete: [PRICING_PARAMS.page] },
            );
        }, 300);
        return () => clearTimeout(t);
    }, [search, parsed.search]);

    // eslint-disable-next-line react-hooks/purity -- roll over status badges at window boundary without a ticking timer
    const now = Date.now();

    const toggleSource = (next: SourceFilter) => {
        const value = parsed.source === next ? "all" : next;
        commit(
            value === "all"
                ? { delete: [PRICING_PARAMS.source, PRICING_PARAMS.page] }
                : { set: { [PRICING_PARAMS.source]: value }, delete: [PRICING_PARAMS.page] },
        );
    };
    const resetFilters = () => {
        setSearch("");
        commit({
            set: { [PRICING_PARAMS.status]: "active,scheduled,expired" },
            delete: [
                PRICING_PARAMS.search,
                PRICING_PARAMS.source,
                PRICING_PARAMS.provider,
                PRICING_PARAMS.page,
            ],
        });
    };

    const editingIsOverride = editing !== null && editing.source === "override";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold">Pricing</h3>
                    <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                        Rates currently in effect for this workspace. Editing a global rate creates
                        a workspace override; editing an override updates it in place.
                    </p>
                </div>
                <Dialog open={formOpen} onOpenChange={setFormOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="size-4" />
                            Add override
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>New pricing override</DialogTitle>
                            <DialogDescription>
                                Define provider, model, region and rates. Optional effective window
                                controls when the rule applies.
                            </DialogDescription>
                        </DialogHeader>
                        <PricingOverrideForm
                            workspaceId={workspaceId}
                            onSaved={() => setFormOpen(false)}
                        />
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <StatTile
                    label="Total"
                    value={counts.total}
                    tone="foreground"
                    pressed={parsed.source === "all"}
                    onClick={() => toggleSource("all")}
                />
                <StatTile
                    label="Global"
                    value={counts.global}
                    tone="muted"
                    pressed={parsed.source === "global"}
                    onClick={() => toggleSource("global")}
                />
                <StatTile
                    label="Overrides"
                    value={counts.override}
                    tone="success"
                    pressed={parsed.source === "override"}
                    onClick={() => toggleSource("override")}
                />
            </div>

            {counts.total === 0 ? (
                <EmptyStateCard
                    icon={CircleDollarSign}
                    title="No pricing rows yet"
                    description="No global price book is synced for this workspace and no overrides have been added. Add an override to bill at a custom rate."
                    action={{
                        label: "Add first override",
                        icon: Plus,
                        onClick: () => setFormOpen(true),
                    }}
                />
            ) : (
                <>
                    <div
                        role="toolbar"
                        aria-label="Filters"
                        className="flex flex-wrap items-center gap-2"
                    >
                        <div className="relative w-full max-w-sm">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search models or providers"
                                aria-label="Search models"
                                className="pl-8"
                            />
                        </div>
                        <FacetedFilter
                            paramKey={PRICING_PARAMS.provider}
                            label="Provider"
                            icon={Server}
                            options={decorateProviderOptions(
                                providers.map((p) => ({ value: p, count: 0 })),
                            )}
                            selected={parsed.provider === "all" ? [] : [parsed.provider]}
                            single
                            clearOnChange={[PRICING_PARAMS.page]}
                        />
                        <FacetedFilter
                            paramKey={PRICING_PARAMS.status}
                            label="Status"
                            icon={CalendarClock}
                            options={STATUS_FILTER_OPTIONS}
                            selected={Array.from(parsed.status)}
                            clearOnChange={[PRICING_PARAMS.page]}
                        />
                    </div>
                    {total === 0 ? (
                        <EmptyStateCard
                            icon={SearchX}
                            title="No rows match these filters"
                            description="Try a different search term, or reset to see every pricing row again."
                            action={{
                                label: "Reset",
                                icon: RotateCcw,
                                onClick: resetFilters,
                            }}
                        />
                    ) : (
                        <>
                            <DashboardSection
                                label="Pricing rows"
                                bodyClassName="-mx-5 mt-5"
                                className="pb-3"
                            >
                                <Table>
                                    <TableHeader className="sticky top-0 z-10 bg-background">
                                        <TableRow>
                                            <TableHead>Provider / Model</TableHead>
                                            <TableHead>Region</TableHead>
                                            <TableHead className="text-right">Input</TableHead>
                                            <TableHead className="text-right">Output</TableHead>
                                            <TableHead className="text-right">
                                                Cached input
                                            </TableHead>
                                            <TableHead>Effective</TableHead>
                                            <TableHead>Source</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {rows.map((row) => (
                                            <PricingRow
                                                key={rowKey(row)}
                                                row={row}
                                                workspaceId={workspaceId}
                                                status={rowStatus(row, now)}
                                                onEdit={() => setEditing(row)}
                                            />
                                        ))}
                                    </TableBody>
                                </Table>
                            </DashboardSection>
                            <PricingPagination page={page} pageCount={pageCount} total={total} />
                        </>
                    )}
                </>
            )}

            <Dialog
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) setEditing(null);
                }}
            >
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {editingIsOverride ? "Edit pricing override" : "Override global rate"}
                        </DialogTitle>
                        <DialogDescription>
                            {editingIsOverride
                                ? "Update rates or the effective window for this override."
                                : "Submitting will create a workspace override starting now. The global rate stays untouched and resumes if you reset later."}
                        </DialogDescription>
                    </DialogHeader>
                    {editing ? (
                        <PricingOverrideForm
                            key={rowKey(editing)}
                            workspaceId={workspaceId}
                            {...(editing.source === "override"
                                ? { overrideId: editing.overrideId }
                                : {})}
                            initialValues={toEditInitialValues(editing)}
                            onSaved={() => setEditing(null)}
                        />
                    ) : null}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function PricingPagination({
    page,
    pageCount,
    total,
}: {
    page: number;
    pageCount: number;
    total: number;
}) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { commit } = useUrlParamCommit();

    if (pageCount <= 1) return null;

    const hrefFor = (n: number): string => {
        const p = new URLSearchParams(searchParams.toString());
        p.set(PRICING_PARAMS.page, String(n));
        return `${pathname}?${p.toString()}`;
    };
    const go = (e: React.MouseEvent<HTMLAnchorElement>, n: number): void => {
        e.preventDefault();
        commit({ set: { [PRICING_PARAMS.page]: String(n) } });
    };
    const tokens: readonly PageToken[] = pageWindow(page, pageCount);
    const prevDisabled = page <= 1;
    const nextDisabled = page >= pageCount;

    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {total.toLocaleString()} row{total === 1 ? "" : "s"} · page {page} of {pageCount}
            </p>
            <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                    <PaginationItem>
                        <PaginationPrevious
                            href={prevDisabled ? undefined : hrefFor(page - 1)}
                            aria-disabled={prevDisabled}
                            tabIndex={prevDisabled ? -1 : undefined}
                            className={prevDisabled ? "pointer-events-none opacity-50" : undefined}
                            onClick={prevDisabled ? undefined : (e) => go(e, page - 1)}
                        />
                    </PaginationItem>
                    {tokens.map((token, i) =>
                        token === "ellipsis" ? (
                            <PaginationItem key={`ellipsis-${i}`}>
                                <PaginationEllipsis />
                            </PaginationItem>
                        ) : (
                            <PaginationItem key={token}>
                                <PaginationLink
                                    href={hrefFor(token)}
                                    isActive={token === page}
                                    onClick={(e) => go(e, token)}
                                >
                                    {token}
                                </PaginationLink>
                            </PaginationItem>
                        ),
                    )}
                    <PaginationItem>
                        <PaginationNext
                            href={nextDisabled ? undefined : hrefFor(page + 1)}
                            aria-disabled={nextDisabled}
                            tabIndex={nextDisabled ? -1 : undefined}
                            className={nextDisabled ? "pointer-events-none opacity-50" : undefined}
                            onClick={nextDisabled ? undefined : (e) => go(e, page + 1)}
                        />
                    </PaginationItem>
                </PaginationContent>
            </Pagination>
        </div>
    );
}

function PricingRow({
    row,
    workspaceId,
    status,
    onEdit,
}: {
    row: PricingRowView;
    workspaceId: string;
    status: RowStatus;
    onEdit: () => void;
}) {
    const tz = useTimeZone();
    return (
        <TableRow>
            <TableCell>
                <ProviderTag id={row.provider} model={row.model} />
            </TableCell>
            <TableCell>
                <StatusTag tone="muted" variant="pill">
                    {row.region}
                </StatusTag>
            </TableCell>
            <TableCell className="text-right font-mono text-sm tabular-nums">
                {formatPreciseUsd(row.inputPer1mUsd)}
            </TableCell>
            <TableCell className="text-right font-mono text-sm tabular-nums">
                {formatPreciseUsd(row.outputPer1mUsd)}
            </TableCell>
            <TableCell
                className={cn(
                    "text-right font-mono text-sm tabular-nums",
                    row.cachePer1mUsd === null && "text-muted-foreground",
                )}
            >
                {row.cachePer1mUsd === null ? "—" : formatPreciseUsd(row.cachePer1mUsd)}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <CalendarClock className="size-3 shrink-0" />
                    <div className="flex flex-col">
                        <span className="tabular-nums">
                            {formatDateTime(new Date(row.effectiveFrom), tz)}
                        </span>
                        <span
                            className={cn(
                                "tabular-nums",
                                row.effectiveTo === null && "text-muted-foreground/70",
                            )}
                        >
                            {row.effectiveTo === null
                                ? "indefinite"
                                : `→ ${formatDateTime(new Date(row.effectiveTo), tz)}`}
                        </span>
                    </div>
                </div>
            </TableCell>
            <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                    <StatusTag tone={SOURCE_TONE[row.source]} variant="pill">
                        {SOURCE_LABEL[row.source]}
                    </StatusTag>
                    <StatusTag tone={STATUS_TONE[status]} variant="pill">
                        {STATUS_LABEL[status]}
                    </StatusTag>
                </div>
            </TableCell>
            <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={
                            row.source === "global" ? "Override global rate" : "Edit override"
                        }
                        onClick={onEdit}
                    >
                        <Pencil className="size-4 text-muted-foreground" />
                    </Button>
                    {row.source === "override" ? (
                        <ResetToGlobalButton
                            workspaceId={workspaceId}
                            overrideId={row.overrideId}
                        />
                    ) : null}
                </div>
            </TableCell>
        </TableRow>
    );
}

function ResetToGlobalButton({
    workspaceId,
    overrideId,
}: {
    workspaceId: string;
    overrideId: string;
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Reset to global">
                    <RotateCcw className="size-4 text-muted-foreground" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Reset to global?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Resetting to global will remove this override. Future events will fall back
                        to the global rate.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <form action={deletePricingOverrideAction}>
                        <input type="hidden" name="workspaceId" value={workspaceId} />
                        <input type="hidden" name="overrideId" value={overrideId} />
                        <AlertDialogAction type="submit">Reset to global</AlertDialogAction>
                    </form>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
