/**
 * Header for the setup wizard. Labelled steps; the current one is filled,
 * completed ones show a green check, a skipped plan step shows a muted dash, and
 * pending ones are muted. Purely presentational — the active step comes from the
 * `?step` URL the page reads, so back/refresh keep the indicator in sync. PLAN
 * is cloud-only; `showPlan` drops it for self-host.
 */

import type { WizardStep } from "@/lib/onboarding/wizard-step";
import { cn } from "@/lib/utils";
import { Check, Minus } from "lucide-react";

const ALL_STEPS: ReadonlyArray<{ readonly step: WizardStep; readonly label: string }> = [
    { step: 0, label: "Plan" },
    { step: 1, label: "Workspace" },
    { step: 2, label: "API key" },
    { step: 3, label: "Connect" },
];

interface WizardStepperProps {
    readonly current: WizardStep;
    /** Cloud shows the optional plan step; self-host starts at Workspace. */
    readonly showPlan: boolean;
    /** Render a passed plan step as skipped (dash) rather than done (check). */
    readonly planSkipped?: boolean;
}

export function WizardStepper({ current, showPlan, planSkipped = false }: WizardStepperProps) {
    const steps = showPlan ? ALL_STEPS : ALL_STEPS.filter((s) => s.step !== 0);
    return (
        <ol className="flex items-center gap-2" aria-label="Setup progress">
            {steps.map(({ step, label }, i) => {
                const active = step === current;
                const past = step < current;
                const skipped = past && step === 0 && planSkipped;
                const done = past && !skipped;
                return (
                    <li key={step} className="flex items-center gap-2">
                        <span
                            className={cn(
                                "flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em]",
                                done && "text-success",
                                active && "text-foreground",
                                skipped && "text-muted-foreground line-through",
                                !done && !active && !skipped && "text-muted-foreground/50",
                            )}
                            aria-current={active ? "step" : undefined}
                        >
                            {done ? (
                                <Check aria-hidden className="size-3 text-success" />
                            ) : skipped ? (
                                <Minus aria-hidden className="size-3 text-muted-foreground" />
                            ) : (
                                <span
                                    aria-hidden
                                    className={cn(
                                        "size-1.5 rounded-full",
                                        active ? "bg-foreground" : "bg-muted-foreground/40",
                                    )}
                                />
                            )}
                            {label}
                        </span>
                        {i < steps.length - 1 ? (
                            <span aria-hidden className="h-px w-6 bg-border" />
                        ) : null}
                    </li>
                );
            })}
        </ol>
    );
}
