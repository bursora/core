import { cn } from "@/lib/utils";
import { useId, useMemo } from "react";

export interface SparkChartProps {
    readonly data: readonly number[];
    readonly className?: string;
}

const SPARK_W = 100;
const SPARK_H = 100;

function SparkChart({ data, className }: SparkChartProps) {
    const gradientId = useId();
    const { path, area, last } = useMemo(() => {
        const max = Math.max(...data, 1);
        const n = data.length;
        const pts = data.map(
            (d, i) =>
                [
                    n === 1 ? SPARK_W / 2 : (i / (n - 1)) * SPARK_W,
                    SPARK_H - (d / max) * (SPARK_H - 8) - 4,
                ] as const,
        );
        const p = pts
            .map((pt, i) => `${i === 0 ? "M" : "L"}${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`)
            .join(" ");
        return { path: p, area: `${p} L${SPARK_W} ${SPARK_H} L0 ${SPARK_H} Z`, last: pts.at(-1) };
    }, [data]);

    return (
        <svg
            viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
            preserveAspectRatio="none"
            className={cn("size-full overflow-visible text-success", className)}
            aria-hidden
        >
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradientId})`} />
            <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            {last && (
                <>
                    <circle
                        cx={last[0]}
                        cy={last[1]}
                        r="3.6"
                        fill="currentColor"
                        opacity="0.25"
                        vectorEffect="non-scaling-stroke"
                    />
                    <circle
                        cx={last[0]}
                        cy={last[1]}
                        r="2"
                        fill="currentColor"
                        vectorEffect="non-scaling-stroke"
                    />
                </>
            )}
        </svg>
    );
}

export { SparkChart };
