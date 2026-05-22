import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { LandingFillBar } from "./landing-bar";

export type KpiTone = "up" | "down" | "neut";

export interface KpiProps {
    readonly label: string;
    readonly value: ReactNode;
    readonly delta?: string;
    readonly tone?: KpiTone;
    readonly fillPercent?: number;
}

function Kpi({ label, value, delta, tone = "neut", fillPercent }: KpiProps) {
    return (
        <div className="rounded-[8px] border border-border bg-background p-3.5">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                {label}
            </div>
            <div className="mt-1.5 text-[24px] font-semibold tracking-[-0.02em] tabular-nums text-foreground">
                {value}
            </div>
            {delta ? (
                <div
                    className={cn(
                        "mt-1.5 font-mono text-[11px]",
                        tone === "up" && "text-destructive",
                        tone === "down" && "text-success",
                        tone === "neut" && "text-muted-foreground/70",
                    )}
                >
                    {delta}
                </div>
            ) : null}
            {fillPercent !== undefined ? (
                <div className="relative mt-3 h-px overflow-hidden bg-muted">
                    <LandingFillBar pct={fillPercent} className="bg-muted-foreground" />
                </div>
            ) : null}
        </div>
    );
}

export { Kpi };
