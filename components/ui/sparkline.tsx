"use client";

/**
 * Compact area sparkline rendered with recharts. No axes, no tooltip — just
 * the shape of a small numeric trend. Honors prefers-reduced-motion.
 */

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useReducedMotion } from "./hooks/use-reduced-motion";
import { sparklinePoints } from "./sparkline-data";

interface SparklineProps {
    readonly data: readonly number[];
    readonly width?: number;
    readonly height?: number;
    readonly color?: string;
    readonly ariaLabel?: string;
}

export function Sparkline({
    data,
    width = 120,
    height = 32,
    color = "var(--primary)",
    ariaLabel = "Trend",
}: SparklineProps) {
    const reduced = useReducedMotion();
    const points = sparklinePoints(data);

    if (points.length === 0) {
        return (
            <div
                role="img"
                aria-label={`${ariaLabel}: no data`}
                style={{ width, height }}
                className="rounded-sm bg-muted/40"
            />
        );
    }

    return (
        <div role="img" aria-label={ariaLabel} style={{ width, height }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart
                    data={points as { i: number; v: number }[]}
                    margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
                >
                    <defs>
                        <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey="v"
                        stroke={color}
                        strokeWidth={1.5}
                        fill="url(#sparkline-fill)"
                        isAnimationActive={!reduced}
                        dot={false}
                        activeDot={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
