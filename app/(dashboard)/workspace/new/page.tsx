import { readIssuedKey } from "@/app/(dashboard)/workspace/[workspaceId]/settings/issued-key-cookie";
import { OnboardingShell } from "@/components/shell/onboarding-shell";
import { requireSessionUI } from "@/lib/auth";
import { env } from "@/lib/env";
import { assertWorkspaceMemberOrNotFound, listApiKeys } from "@/lib/identity/server";
import { getCheckoutAction, isUserSubscribed } from "@/lib/onboarding/plan-entry";
import { getOnboardingPlan } from "@/lib/onboarding/plan-view";
import {
    parseWizardStep,
    wizardStepPath,
    workspaceCreationGate,
    type WizardStep,
} from "@/lib/onboarding/wizard-step";
import { deriveOnboardingWorkspaceName } from "@/lib/onboarding/workspace-name";
import { Building2, KeyRound, Terminal } from "lucide-react";
import { redirect } from "next/navigation";
import { ConnectStep } from "./_components/connect-step";
import { KeyStep } from "./_components/key-step";
import { PlanStep } from "./_components/plan-step";
import { WizardStepper } from "./_components/wizard-stepper";
import { createWorkspaceAction } from "./actions";
import { NewWorkspaceForm } from "./new-workspace-form";

interface NewWorkspacePageProps {
    searchParams: Promise<{ step?: string; ws?: string; billing?: string }>;
}

const HEADERS: Record<
    Exclude<WizardStep, 0>,
    { icon: typeof Building2; title: string; subtitle: string }
> = {
    1: {
        icon: Building2,
        title: "Create a workspace",
        subtitle: "Workspaces hold your API keys, budgets, and team members.",
    },
    2: {
        icon: KeyRound,
        title: "Your API key",
        subtitle: "The SDK uses this secret to authenticate to Bursora.",
    },
    3: {
        icon: Terminal,
        title: "Connect your app",
        subtitle: "Wrap your AI client and send your first call.",
    },
};

export default async function NewWorkspacePage({ searchParams }: NewWorkspacePageProps) {
    const session = await requireSessionUI();
    const { step: rawStep, ws, billing } = await searchParams;
    const isCloud = env().IS_CLOUD;
    const step = parseWizardStep(rawStep);

    // Step ⓪ Plan is the mandatory, cloud-only subscribe step.
    if (step === 0 && !isCloud) redirect(wizardStepPath(1));
    if (step === 0) {
        const subscribed = await isUserSubscribed(session.user.id);
        const returnedFromCheckout = billing === "ok";
        const returnedActive = subscribed && returnedFromCheckout;
        // Already subscribed and just browsing back here: nothing to do, send
        // them on to create a workspace.
        if (subscribed && !returnedFromCheckout) redirect(wizardStepPath(1));
        // Returned from a successful checkout but the activation webhook hasn't
        // landed yet — render the plan step in its polling "finalizing" state
        // so it self-updates the moment the subscription activates.
        const awaitingActivation = returnedFromCheckout && !subscribed;
        const plan = await getOnboardingPlan();
        // No active plan configured — let the user through rather than trap them
        // on a step we can't render.
        if (!plan) redirect(wizardStepPath(1));
        const checkoutAction = await getCheckoutAction();
        return (
            <OnboardingShell>
                <div className="mb-6">
                    <WizardStepper current={0} showPlan />
                </div>
                <PlanStep
                    plan={plan}
                    checkoutAction={checkoutAction}
                    returnedActive={returnedActive}
                    awaitingActivation={awaitingActivation}
                    nextPath={wizardStepPath(1)}
                    selfHostUrl={`${process.env.NEXT_PUBLIC_SITE_URL}/docs/get-started/self-host`}
                />
            </OnboardingShell>
        );
    }

    // Subscribe-first gate: on cloud an owner cannot reach workspace creation
    // without an active subscription. Route them to the plan step until checkout
    // completes. Steps ②/③ act on a workspace that already exists, which means
    // creation already passed the gate, so they aren't re-checked here. When no
    // plan is configured there's nothing to subscribe to (the plan step bails
    // the same way), so let creation through rather than loop step 1 ↔ step 0.
    if (step === 1 && isCloud) {
        const subscribed = await isUserSubscribed(session.user.id);
        if (workspaceCreationGate({ isCloud, subscribed }) === 0 && (await getOnboardingPlan())) {
            redirect(wizardStepPath(0));
        }
    }

    // Steps ② and ③ are scoped to a workspace the user owns; `/workspace/new`
    // sits outside the `[workspaceId]` layout, so assert membership here to keep
    // a forged `?ws=` from reading someone else's keys.
    if (step === 2 || step === 3) {
        if (!ws) redirect(wizardStepPath(1));
        await assertWorkspaceMemberOrNotFound({ workspaceId: ws, userId: session.user.id });
    }

    const header = HEADERS[step];
    const Icon = header.icon;

    return (
        <OnboardingShell>
            <div className="mb-6">
                <WizardStepper current={step} showPlan={isCloud} />
            </div>
            <section className="rounded-[8px] border border-border bg-background p-6">
                <div className="flex items-start gap-3">
                    <div
                        className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-foreground"
                        aria-hidden
                    >
                        <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1.5">
                        <h2 className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                            {header.title}
                        </h2>
                        <p className="text-sm text-muted-foreground">{header.subtitle}</p>
                    </div>
                </div>
                <div className="mt-5">
                    {step === 1 ? (
                        <NewWorkspaceForm
                            action={createWorkspaceAction}
                            defaultName={deriveOnboardingWorkspaceName({
                                name: session.user.name,
                                email: session.user.email,
                            })}
                        />
                    ) : null}
                    {step === 2 && ws ? <KeyStepSection workspaceId={ws} /> : null}
                    {step === 3 && ws ? <ConnectStepSection workspaceId={ws} /> : null}
                </div>
            </section>
        </OnboardingShell>
    );
}

async function KeyStepSection({ workspaceId }: { readonly workspaceId: string }) {
    const [plaintext, keys] = await Promise.all([readIssuedKey(), listApiKeys(workspaceId)]);
    const hasLiveKey = keys.some((k) => k.revokedAt === null);
    return <KeyStep workspaceId={workspaceId} plaintext={plaintext} hasLiveKey={hasLiveKey} />;
}

async function ConnectStepSection({ workspaceId }: { readonly workspaceId: string }) {
    const [keys, issued] = await Promise.all([listApiKeys(workspaceId), readIssuedKey()]);
    const liveKey = keys
        .filter((k) => k.revokedAt === null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    // No live key means step ② was skipped or the key was revoked; send the user
    // back to issue one rather than render a snippet with no key.
    if (!liveKey) redirect(wizardStepPath(2, workspaceId));
    return <ConnectStep workspaceId={workspaceId} issuedPlaintext={issued} />;
}
