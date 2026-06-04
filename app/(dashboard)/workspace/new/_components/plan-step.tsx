"use client";

/**
 * Step ⓪ of the setup wizard: the optional, cloud-only Bursora Cloud plan card.
 * Price and features come from the plans table (passed in), never hardcoded.
 *
 * States:
 *   - default — plan card with "Subscribe to Cloud" (user-scoped checkout) and
 *     "Skip for now". The subscribe form's SubmitButton spins while the redirect
 *     to checkout is in flight.
 *   - finalizing — the user just returned from a successful checkout but the
 *     activation webhook hasn't landed yet. Poll the subscription-status signal
 *     until it flips active; show a "finalizing…" panel meanwhile. Skip stays
 *     available so a slow webhook never traps the user.
 *   - subscribed — active (on arrival, or once the poll confirms): collapse to a
 *     confirmation and auto-advance to the workspace step.
 *
 * This makes the page correct whether the webhook arrives before or after the
 * checkout redirect — the reported race where the card re-appeared post-payment.
 */

import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { StatusTag } from "@/components/ui/workspace/status-tag";
import type { OnboardingPlanView } from "@/lib/onboarding/plan-view";
import { Check, Loader2, Zap } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface PlanStepProps {
    readonly plan: OnboardingPlanView;
    readonly checkoutAction: () => Promise<void>;
    readonly skipAction: () => Promise<void>;
    /** Active on arrival (webhook landed before the checkout redirect). */
    readonly returnedActive: boolean;
    /** Returned from checkout but not yet active — poll until the webhook lands. */
    readonly awaitingActivation: boolean;
    readonly nextPath: Route;
}

const AUTO_ADVANCE_MS = 1000;
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 90_000;

interface SubscriptionStatusResponse {
    readonly active: boolean;
}

function useSubscriptionPoll(enabled: boolean): { active: boolean; timedOut: boolean } {
    const [active, setActive] = useState(false);
    const [timedOut, setTimedOut] = useState(false);

    useEffect(() => {
        if (!enabled || active) return;

        let live = true;
        const controller = new AbortController();
        const startedAt = Date.now();

        const poll = async (): Promise<void> => {
            try {
                const res = await fetch("/api/internal/subscription-status", {
                    credentials: "include",
                    signal: controller.signal,
                });
                if (!res.ok) return;
                const body = (await res.json()) as SubscriptionStatusResponse;
                if (live && body.active) setActive(true);
            } catch {
                // Aborts (unmount) and transient errors are non-fatal; retry next tick.
            }
        };

        const interval = setInterval(() => {
            if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
                clearInterval(interval);
                if (live) setTimedOut(true);
                return;
            }
            void poll();
        }, POLL_INTERVAL_MS);

        void poll();

        return () => {
            live = false;
            controller.abort();
            clearInterval(interval);
        };
    }, [enabled, active]);

    return { active, timedOut };
}

export function PlanStep({
    plan,
    checkoutAction,
    skipAction,
    returnedActive,
    awaitingActivation,
    nextPath,
}: PlanStepProps) {
    const router = useRouter();
    const poll = useSubscriptionPoll(awaitingActivation && !returnedActive);
    const active = returnedActive || poll.active;

    useEffect(() => {
        if (!active) return;
        const timer = setTimeout(() => router.push(nextPath), AUTO_ADVANCE_MS);
        return () => clearTimeout(timer);
    }, [active, router, nextPath]);

    if (active) {
        return (
            <section
                role="status"
                className="rounded-[8px] border border-success/40 bg-success/5 p-6"
            >
                <div className="flex items-center gap-2 text-success">
                    <Check aria-hidden className="size-5" />
                    <h2 className="text-base font-semibold tracking-[-0.01em]">Subscribed</h2>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Taking you to setup…</p>
            </section>
        );
    }

    if (awaitingActivation) {
        return (
            <section role="status" className="rounded-[8px] border border-border bg-muted/20 p-6">
                <div className="flex items-center gap-2 text-foreground">
                    <Loader2
                        aria-hidden
                        className="size-5 animate-spin motion-reduce:animate-none"
                    />
                    <h2 className="text-base font-semibold tracking-[-0.01em]">
                        Finalizing your subscription…
                    </h2>
                </div>
                <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
                    {poll.timedOut
                        ? "This is taking longer than usual. Your payment went through — refresh in a moment, or continue and it'll unlock once confirmed."
                        : "Payment received. Confirming your subscription — this usually takes a few seconds."}
                </p>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <form action={skipAction}>
                        <Button type="submit" variant="ghost" className="w-full sm:w-auto">
                            Continue
                        </Button>
                    </form>
                    {poll.timedOut ? (
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={() => router.refresh()}
                        >
                            Refresh
                        </Button>
                    ) : null}
                </div>
            </section>
        );
    }

    return (
        <section className="rounded-[8px] border bg-background p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold tracking-[-0.01em]">{plan.name}</h2>
                    <p className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-semibold tabular-nums">{plan.price}</span>
                        <span className="text-sm text-muted-foreground">/ {plan.interval}</span>
                    </p>
                </div>
                <StatusTag tone="muted" variant="pill">
                    Optional
                </StatusTag>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-[8px] border border-success/25 bg-success/[0.06] px-3 py-2.5">
                <Zap className="size-3.5 shrink-0 text-success" strokeWidth={2.4} />
                <span className="font-mono text-[12px] leading-snug text-foreground/80">
                    Pays for itself the first night it blocks a runaway.
                </span>
            </div>

            {plan.features.length > 0 ? (
                <ul className="mt-4 space-y-2">
                    {plan.features.map((feature) => (
                        <li
                            key={feature}
                            className="flex items-start gap-2 text-sm text-foreground/90"
                        >
                            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                            {feature}
                        </li>
                    ))}
                </ul>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <form action={skipAction}>
                    <Button type="submit" variant="ghost" className="w-full sm:w-auto">
                        Skip for now
                    </Button>
                </form>
                <form action={checkoutAction}>
                    <SubmitButton
                        pendingLabel="Redirecting…"
                        autoFocus
                        className="w-full sm:min-w-44"
                    >
                        Subscribe to Cloud
                    </SubmitButton>
                </form>
            </div>
        </section>
    );
}
