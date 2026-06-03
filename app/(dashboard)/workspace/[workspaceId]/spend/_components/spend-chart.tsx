"use client";

/**
 * Faceted spend-over-time area chart. Each tag drawn from zero so magnitude
 * differences are visible. Only the top N tags by total cost are shown
 * individually; the rest are bucketed into an "Other" series.
 */

import {
    type ChartMetric,
    type ChartRow,
    MAX_VISIBLE_TAGS,
    OTHER_KEY,
    buildRows,
} from "@/app/(dashboard)/workspace/[workspaceId]/spend/_lib/build-rows";
import { Card } from "@/components/ui/card";
import { useReducedMotion } from "@/components/ui/hooks/use-reduced-motion";
import { useTimeZone } from "@/components/ui/hooks/use-time-zone";
import { SwatchDot } from "@/components/ui/swatch-dot";
import { formatCount, formatUsd } from "@/lib/format";
import type { FacetedSeries } from "@/lib/metering";
import { formatInZone } from "@/lib/time/zone";
import { useMemo } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

interface SpendChartProps {
    series: FacetedSeries;
    /** Defaults to `'cost'`. Switch to `'count'` for blocked-only views where
     *  cost is $0 everywhere and call count is the meaningful axis. */
    metric?: ChartMetric;
}

const PALETTE = [
    "var(--primary)",
    "var(--accent-foreground)",
    "var(--warning)",
    "var(--destructive)",
    "var(--success)",
    "var(--muted-foreground)",
];

const OTHER_COLOR = "var(--muted-foreground)";

function tagColor(tag: string, i: number): string {
    if (tag === OTHER_KEY) return OTHER_COLOR;
    return PALETTE[i % PALETTE.length] ?? "var(--primary)";
}

const TICK_OPTS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric" };

export function SpendChart({ series, metric = "cost" }: SpendChartProps) {
    const reduced = useReducedMotion();
    const tz = useTimeZone();
    const tickFormatter = (t: number): string => formatInZone(new Date(t), tz, TICK_OPTS);

    const { rows, tags, hasOther } = useMemo(
        () => buildRows(series.points, { metric }),
        [series.points, metric],
    );

    if (rows.length === 0) {
        return <p className="py-12 text-center text-sm text-muted-foreground">No data yet.</p>;
    }

    const formatValue = (v: number): string => (metric === "cost" ? formatUsd(v) : formatCount(v));

    return (
        <div className="h-80 w-full text-foreground">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart
                    data={rows}
                    margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                    stackOffset="none"
                >
                    <defs>
                        {tags.map((tag, i) => {
                            const color = tagColor(tag, i);
                            return (
                                <linearGradient
                                    key={tag}
                                    id={`spend-fill-${i}`}
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                                    <stop offset="100%" stopColor={color} stopOpacity={0.1} />
                                </linearGradient>
                            );
                        })}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                        dataKey="t"
                        type="number"
                        domain={[series.from.getTime(), series.to.getTime()]}
                        scale="time"
                        tickFormatter={tickFormatter}
                        stroke="var(--muted-foreground)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        stroke="var(--muted-foreground)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={formatValue}
                        width={72}
                        scale="sqrt"
                        domain={[0, "dataMax"]}
                    />
                    <Tooltip content={<SpendTooltip metric={metric} tz={tz} />} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                    {tags.map((tag, i) => {
                        const color = tagColor(tag, i);
                        return (
                            <Area
                                key={tag}
                                type="monotone"
                                dataKey={tag}
                                stroke={color}
                                strokeWidth={1.5}
                                fill={`url(#spend-fill-${i})`}
                                fillOpacity={1}
                                isAnimationActive={!reduced}
                                connectNulls
                            />
                        );
                    })}
                </AreaChart>
            </ResponsiveContainer>
            {hasOther ? (
                <p className="mt-2 text-xs text-muted-foreground">
                    Showing top {MAX_VISIBLE_TAGS} · remaining grouped as &ldquo;Other&rdquo;.
                </p>
            ) : null}
        </div>
    );
}

interface TooltipPayloadItem {
    readonly name?: string | number;
    readonly value?: number | string;
    readonly color?: string;
    readonly dataKey?: string | number;
    readonly payload?: ChartRow;
}

interface SpendTooltipProps {
    readonly active?: boolean;
    readonly label?: number | string;
    readonly payload?: readonly TooltipPayloadItem[];
    readonly metric?: ChartMetric;
    readonly tz?: string;
}

function SpendTooltip({ active, label, payload, metric = "cost", tz = "UTC" }: SpendTooltipProps) {
    if (!active || payload === undefined || payload.length === 0) return null;

    const sorted = [...payload].sort((a, b) => {
        const av = typeof a.value === "number" ? a.value : 0;
        const bv = typeof b.value === "number" ? b.value : 0;
        return bv - av;
    });
    const calls = sorted[0]?.payload?.__calls ?? 0;
    const heading =
        typeof label === "number"
            ? formatInZone(new Date(label), tz, TICK_OPTS)
            : String(label ?? "");
    const formatValue = (v: number): string => (metric === "cost" ? formatUsd(v) : formatCount(v));

    return (
        <Card className="gap-0 bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md">
            <p className="mb-1 font-medium">{heading}</p>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {sorted.map((item) => (
                    <li
                        key={String(item.dataKey ?? item.name)}
                        className="flex items-center justify-between gap-3"
                    >
                        <span className="flex items-center gap-2">
                            <SwatchDot color={item.color} />
                            <span>{String(item.name ?? "")}</span>
                        </span>
                        <span className="tabular-nums">
                            {typeof item.value === "number"
                                ? formatValue(item.value)
                                : String(item.value ?? "")}
                        </span>
                    </li>
                ))}
                <li className="mt-1 flex items-center justify-between gap-3 border-t pt-1">
                    <span>Calls</span>
                    <span className="tabular-nums">{formatCount(calls)}</span>
                </li>
            </ul>
        </Card>
    );
}
