// Pure presentational sibling of the dashboard `StatusStrip`. Takes a fully
// resolved view-model (tones, labels, tooltips already computed) so it stays
// IO-free and server-renderable. The real StatusStrip maps its loaders onto
// these props; the landing page feeds a static fixture.

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../tooltip";

export type StatusStripTone = "success" | "warning" | "destructive" | "muted";
export type StatusChannelKind = "slack" | "discord" | "email";

export interface StatusStripChannelView {
    readonly kind: StatusChannelKind;
    readonly tone: StatusStripTone;
    readonly tooltip: string;
}

export interface StatusStripViewProps {
    readonly sdk: { readonly tone: StatusStripTone; readonly label: string };
    readonly channels: readonly StatusStripChannelView[];
    readonly setupCount: number;
}

const TONE_TEXT: Record<StatusStripTone, string> = {
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
};

const TONE_DOT_BG: Record<StatusStripTone, string> = {
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
    muted: "bg-muted-foreground/40",
};

const CHANNEL_LABEL: Record<StatusChannelKind, string> = {
    slack: "SLACK",
    discord: "DISCORD",
    email: "EMAIL",
};

export function StatusStripView({ sdk, channels, setupCount }: StatusStripViewProps) {
    const setupTone: StatusStripTone = setupCount > 0 ? "destructive" : "muted";

    return (
        <TooltipProvider>
            <div className="flex h-6 items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                <span className="inline-flex items-center gap-1.5">
                    <span>SDK</span>
                    <span
                        aria-hidden="true"
                        className={cn("inline-block size-1.5 rounded-full", TONE_DOT_BG[sdk.tone])}
                    />
                    <span
                        className={cn(
                            "normal-case tracking-normal tabular-nums",
                            TONE_TEXT[sdk.tone],
                        )}
                    >
                        {sdk.label}
                    </span>
                </span>
                {channels.length > 0 ? (
                    <>
                        <span className="text-muted-foreground/40">·</span>
                        {channels.map((channel, idx) => (
                            <ChannelDot
                                key={channel.kind}
                                channel={channel}
                                showSeparator={idx > 0}
                            />
                        ))}
                    </>
                ) : null}
                <span className="text-muted-foreground/40">·</span>
                <span className="inline-flex items-center gap-1.5">
                    <span>setup errors:</span>
                    <span className={cn("tabular-nums", TONE_TEXT[setupTone])}>{setupCount}</span>
                </span>
            </div>
        </TooltipProvider>
    );
}

interface ChannelDotProps {
    readonly channel: StatusStripChannelView;
    readonly showSeparator: boolean;
}

function ChannelDot({ channel, showSeparator }: ChannelDotProps) {
    return (
        <>
            {showSeparator ? <span className="text-muted-foreground/40">·</span> : null}
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1.5" aria-label={channel.tooltip}>
                        <span>{CHANNEL_LABEL[channel.kind]}</span>
                        <span
                            aria-hidden="true"
                            className={cn(
                                "inline-block size-1.5 rounded-full",
                                TONE_DOT_BG[channel.tone],
                            )}
                        />
                        <span className="sr-only">{channel.tooltip}</span>
                    </span>
                </TooltipTrigger>
                <TooltipContent>{channel.tooltip}</TooltipContent>
            </Tooltip>
        </>
    );
}
