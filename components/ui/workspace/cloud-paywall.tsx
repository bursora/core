// View-paywall for a locked Bursora Cloud workspace. Rendered in place of the
// real dashboard when the owner's subscription is inactive. The blurred
// skeleton shapes imply there is data behind the gate without leaking any — the
// server short-circuits before fetching, so nothing real reaches this component.
//
// The foreground is an upgrade card. Only the workspace owner sees the Subscribe
// CTA, because the gate keys off the owner's subscription: a member subscribing
// would not unlock the workspace, so members get an "ask the owner" note instead.
// `checkoutAction` is the user-scoped Lemon Squeezy checkout, injected by the
// page so this shared component never imports EE billing.

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitButton } from "@/components/ui/submit-button";
import { Check, Lock, Zap } from "lucide-react";
import Link from "next/link";

interface CloudPaywallProps {
    /** Whether the viewer is the workspace owner (the one whose sub unlocks it). */
    readonly isOwner: boolean;
    /** Formatted plan price, e.g. `$29`. */
    readonly price: string;
    /** Billing interval, e.g. `month`. */
    readonly interval: string;
    /** Value bullets to show; falls back to a default trio when empty. */
    readonly features: readonly string[];
    /** User-scoped checkout action; present only for the owner on cloud. */
    readonly checkoutAction?: () => Promise<void>;
}

const FALLBACK_FEATURES = [
    "Live spend by customer, agent, and model",
    "Hard budget limits that block overspend",
    "Spike alerts to Slack, Discord, and email",
] as const;

export function CloudPaywall({
    isOwner,
    price,
    interval,
    features,
    checkoutAction,
}: CloudPaywallProps) {
    const bullets = features.length > 0 ? features : FALLBACK_FEATURES;

    return (
        <section className="relative isolate overflow-hidden rounded-[8px] border border-border bg-background">
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 select-none overflow-hidden p-5 blur-[6px]"
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }, (_, i) => (
                        <div
                            key={i}
                            className="rounded-[8px] border border-border bg-background p-3.5"
                        >
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="mt-2 h-7 w-32" />
                        </div>
                    ))}
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-40 w-full" />
                </div>
            </div>

            <div className="relative flex min-h-[24rem] items-center justify-center bg-background/70 p-6 dark:bg-background/80">
                <div className="w-full max-w-sm rounded-[8px] border bg-background p-6 shadow-sm dark:bg-muted/30">
                    <div className="flex items-center gap-2.5">
                        <span
                            className="flex size-9 items-center justify-center rounded-md bg-muted text-foreground"
                            aria-hidden
                        >
                            <Lock className="size-4" />
                        </span>
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                            Dashboard locked
                        </span>
                    </div>

                    <h2 className="mt-4 text-base font-semibold tracking-[-0.01em]">
                        Unlock your dashboard
                    </h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        Subscribe to Bursora Cloud to see live spend, budgets, and alerts for this
                        workspace.
                    </p>

                    <div className="mt-4 flex items-baseline gap-1.5 border-t border-border/60 pt-4">
                        <span className="text-2xl font-semibold tabular-nums">{price}</span>
                        <span className="text-sm text-muted-foreground">/ {interval}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                            cancel anytime
                        </span>
                    </div>

                    <div className="mt-4 flex items-center gap-2 rounded-[8px] border border-success/25 bg-success/[0.06] px-3 py-2.5">
                        <Zap className="size-3.5 shrink-0 text-success" strokeWidth={2.4} />
                        <span className="font-mono text-[12px] leading-snug text-foreground/80">
                            Pays for itself the first night it blocks a runaway.
                        </span>
                    </div>

                    <ul className="mt-4 flex flex-col gap-2">
                        {bullets.map((feature) => (
                            <li key={feature} className="flex items-start gap-2 text-sm">
                                <Check
                                    aria-hidden
                                    className="mt-0.5 size-4 shrink-0 text-success"
                                />
                                <span>{feature}</span>
                            </li>
                        ))}
                    </ul>

                    <div className="mt-5">
                        {isOwner && checkoutAction ? (
                            <form action={checkoutAction}>
                                <SubmitButton className="w-full" pendingLabel="Opening checkout…">
                                    Subscribe to Cloud
                                </SubmitButton>
                            </form>
                        ) : (
                            <p className="rounded-[8px] border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                                Ask the workspace owner to subscribe to unlock this dashboard.
                            </p>
                        )}
                    </div>

                    {isOwner ? (
                        <p className="mt-3 text-center text-xs text-muted-foreground">
                            30-day money-back ·{" "}
                            <Button
                                asChild
                                variant="link"
                                className="h-auto p-0 text-xs font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground"
                            >
                                <Link href="/billing">Manage billing</Link>
                            </Button>
                        </p>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
