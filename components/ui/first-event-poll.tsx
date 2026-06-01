"use client";

/**
 * Live "has the first usage event landed yet?" strip, shared by the setup
 * wizard and the dashboard "send first event" widget.
 *
 * `FirstEventPoll` polls /api/internal/workspace/[id]/first-event every ~4s,
 * stops after ~2min, and stops immediately once an event lands. The strip
 * flips from "waiting" + a small spinner to a green check + "First event
 * received" with no reload. The status text is aria-live so screen readers
 * announce the flip; the spinner honors prefers-reduced-motion.
 */

import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 120_000;

interface FirstEventResponse {
    readonly received: boolean;
}

export function useFirstEventPoll(workspaceId: string): boolean {
    const [received, setReceived] = useState(false);

    useEffect(() => {
        if (received) return;

        let active = true;
        const controller = new AbortController();
        const startedAt = Date.now();

        const poll = async (): Promise<void> => {
            try {
                const res = await fetch(`/api/internal/workspace/${workspaceId}/first-event`, {
                    credentials: "include",
                    signal: controller.signal,
                });
                if (!res.ok) return;
                const body = (await res.json()) as FirstEventResponse;
                if (active && body.received) setReceived(true);
            } catch {
                // Aborts (on unmount) and transient network errors are non-fatal;
                // the next tick retries until the deadline.
            }
        };

        const interval = setInterval(() => {
            if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
                clearInterval(interval);
                return;
            }
            void poll();
        }, POLL_INTERVAL_MS);

        // Kick once immediately so a workspace that already has events flips
        // without waiting a full interval.
        void poll();

        return () => {
            active = false;
            controller.abort();
            clearInterval(interval);
        };
    }, [workspaceId, received]);

    return received;
}

interface FirstEventStatusProps {
    readonly received: boolean;
}

export function FirstEventStatus({ received }: FirstEventStatusProps) {
    return (
        <div className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <span aria-live="polite" className={cn(received && "text-success")}>
                {received ? "First event received" : "waiting"}
            </span>
            {received ? (
                <Check aria-hidden className="size-3 text-success" />
            ) : (
                <Loader2 aria-hidden className="size-3 animate-spin motion-reduce:animate-none" />
            )}
        </div>
    );
}

interface FirstEventPollProps {
    readonly workspaceId: string;
}

export function FirstEventPoll({ workspaceId }: FirstEventPollProps) {
    const received = useFirstEventPoll(workspaceId);
    return <FirstEventStatus received={received} />;
}

/**
 * Bordered "listening for your first call" panel used by the setup wizard's
 * connect step. Same live poll as `FirstEventPoll`, but a larger status panel:
 * a pulsing dot + "Listening…" flips to a green check + "First call received"
 * with no reload. The dot's pulse honors prefers-reduced-motion.
 */
export function FirstEventPanel({ workspaceId }: FirstEventPollProps) {
    const received = useFirstEventPoll(workspaceId);
    return (
        <div
            role="status"
            className={cn(
                "flex items-center gap-2.5 rounded-[8px] border p-3 text-sm",
                received
                    ? "border-success/40 bg-success/5 text-success"
                    : "border-border bg-muted/20 text-muted-foreground",
            )}
        >
            {received ? (
                <Check aria-hidden className="size-4 shrink-0" />
            ) : (
                <span aria-hidden className="relative flex size-2.5 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-muted-foreground/50 motion-reduce:animate-none" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-muted-foreground/70" />
                </span>
            )}
            <span aria-live="polite">
                {received
                    ? "First call received"
                    : "Listening for your first call… we detect it automatically"}
            </span>
        </div>
    );
}
