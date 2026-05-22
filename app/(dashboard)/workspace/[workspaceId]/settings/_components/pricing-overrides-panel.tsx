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
import { Input } from "@/components/ui/input";
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
import { useDeferredValue, useMemo, useState } from "react";
import { PricingOverrideForm } from "./pricing-override-form";
import {
    filterRows,
    isRowStatus,
    rowStatus,
    sortRows,
    summarizePricingRows,
    toEditInitialValues,
    type PricingRowView,
    type RowStatus,
    type SourceFilter,
} from "./pricing-panel-helpers";

interface Props {
    workspaceId: string;
    rows: ReadonlyArray<PricingRowView>;
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

export function PricingOverridesPanel({ workspaceId, rows }: Props) {
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<PricingRowView | null>(null);
    const [search, setSearch] = useState("");
    const debouncedSearch = useDeferredValue(search);
    const [source, setSource] = useState<SourceFilter>("all");
    const [provider, setProvider] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<ReadonlySet<RowStatus>>(
        () => new Set<RowStatus>(["active"]),
    );
    // eslint-disable-next-line react-hooks/purity -- roll over status counts at window boundary without a ticking timer
    const now = Date.now();
    const counts = summarizePricingRows(rows);

    const providerOptions = useMemo(
        () => Array.from(new Set(rows.map((r) => r.provider))).sort(),
        [rows],
    );

    const visibleRows = sortRows(
        filterRows(rows, { search: debouncedSearch, source, provider, status: statusFilter }, now),
        now,
    );

    const toggleSource = (next: SourceFilter) => {
        setSource((prev) => (prev === next ? "all" : next));
    };
    const resetFilters = () => {
        setSearch("");
        setSource("all");
        setProvider("all");
        setStatusFilter(new Set<RowStatus>(["active", "scheduled", "expired"]));
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
                    pressed={source === "all"}
                    onClick={() => toggleSource("all")}
                />
                <StatTile
                    label="Global"
                    value={counts.global}
                    tone="muted"
                    pressed={source === "global"}
                    onClick={() => toggleSource("global")}
                />
                <StatTile
                    label="Overrides"
                    value={counts.override}
                    tone="success"
                    pressed={source === "override"}
                    onClick={() => toggleSource("override")}
                />
            </div>

            {rows.length === 0 ? (
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
                            paramKey="pricing_provider"
                            label="Provider"
                            icon={Server}
                            options={decorateProviderOptions(
                                providerOptions.map((p) => ({ value: p, count: 0 })),
                            )}
                            selected={provider === "all" ? [] : [provider]}
                            single
                            onChange={(next) => setProvider(next[0] ?? "all")}
                        />
                        <FacetedFilter
                            paramKey="pricing_status"
                            label="Status"
                            icon={CalendarClock}
                            options={STATUS_FILTER_OPTIONS}
                            selected={Array.from(statusFilter)}
                            onChange={(next) => setStatusFilter(new Set(next.filter(isRowStatus)))}
                        />
                    </div>
                    {visibleRows.length === 0 ? (
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
                        <DashboardSection label="Pricing rows" bodyClassName="-mx-5">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background">
                                    <TableRow>
                                        <TableHead>Provider / Model</TableHead>
                                        <TableHead>Region</TableHead>
                                        <TableHead className="text-right">Input</TableHead>
                                        <TableHead className="text-right">Output</TableHead>
                                        <TableHead className="text-right">Cached input</TableHead>
                                        <TableHead>Effective</TableHead>
                                        <TableHead>Source</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {visibleRows.map((row) => (
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
                            {formatDateTime(new Date(row.effectiveFrom))}
                        </span>
                        <span
                            className={cn(
                                "tabular-nums",
                                row.effectiveTo === null && "text-muted-foreground/70",
                            )}
                        >
                            {row.effectiveTo === null
                                ? "indefinite"
                                : `→ ${formatDateTime(new Date(row.effectiveTo))}`}
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
