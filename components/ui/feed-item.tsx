import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type FeedItemKind = "block" | "warn" | "ok";

export interface FeedItemProps {
    readonly timestamp: string;
    readonly kind: FeedItemKind;
    readonly who?: string;
    readonly children: ReactNode;
}

function FeedItem({ timestamp, kind, who, children }: FeedItemProps) {
    return (
        <div className="flex items-start gap-3 border-b border-border/60 px-4 py-3 text-[13px] last:border-b-0">
            <span className="w-14 shrink-0 pt-0.5 font-mono text-[10.5px] text-muted-foreground/70">
                {timestamp}
            </span>
            <span
                className={cn(
                    "w-14 shrink-0 pt-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
                    kind === "block" && "text-destructive",
                    kind === "warn" && "text-warning",
                    kind === "ok" && "text-success",
                )}
            >
                {kind}
            </span>
            <span className="leading-[1.45] text-foreground/90">
                {who ? <span className="font-mono text-muted-foreground">{who}</span> : null}
                {who ? " · " : null}
                {children}
            </span>
        </div>
    );
}

export { FeedItem };
