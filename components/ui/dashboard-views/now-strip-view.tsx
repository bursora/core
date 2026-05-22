import { Kpi, type KpiTone } from "../kpi";
import { SparkChart } from "../spark-chart";
import { formatCount, formatSignedPercent, formatUsd } from "@/lib/format";

export interface NowStripViewProps {
    readonly suffix: string;
    readonly deltaCaption: string;
    readonly spend: {
        readonly total: number;
        readonly delta: number;
        readonly series: readonly number[];
    };
    readonly calls: {
        readonly count: number;
        readonly delta: number;
        readonly series: readonly number[];
    };
    readonly budgets: {
        readonly active: number;
        readonly deltaLabel: string;
        readonly tone: KpiTone;
    };
    readonly alerts: {
        readonly total24h: number;
        readonly deltaLabel: string;
        readonly tone: KpiTone;
    };
}

export function NowStripView({
    suffix,
    deltaCaption,
    spend,
    calls,
    budgets,
    alerts,
}: NowStripViewProps) {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
                <Kpi
                    label={`Spend, ${suffix}`}
                    value={formatUsd(spend.total)}
                    delta={`${formatSignedPercent(spend.delta)} ${deltaCaption}`}
                    tone={spend.delta > 0 ? "up" : spend.delta < 0 ? "down" : "neut"}
                />
                <div className="pointer-events-none absolute right-3.5 top-3.5 h-8 w-20">
                    <SparkChart data={spend.series} />
                </div>
            </div>
            <div className="relative">
                <Kpi
                    label={`Calls, ${suffix}`}
                    value={formatCount(calls.count)}
                    delta={`${formatSignedPercent(calls.delta)} ${deltaCaption}`}
                    tone="neut"
                />
                <div className="pointer-events-none absolute right-3.5 top-3.5 h-8 w-20">
                    <SparkChart data={calls.series} />
                </div>
            </div>
            <Kpi
                label="Active budgets"
                value={formatCount(budgets.active)}
                delta={budgets.deltaLabel}
                tone={budgets.tone}
            />
            <Kpi
                label="Alerts, 24h"
                value={formatCount(alerts.total24h)}
                delta={alerts.deltaLabel}
                tone={alerts.tone}
            />
        </div>
    );
}
