/**
 * Pure parser for the welcome wizard's `?step` search param. The wizard lives
 * at `/workspace/new` and is driven entirely by the URL so back/refresh keep
 * the step. Anything that isn't a known step falls back to step 1.
 */

import type { Route } from "next";

/**
 * Step ⓪ PLAN is the mandatory, cloud-only subscribe step; ① WORKSPACE, ② API
 * KEY, ③ CONNECT follow. Self-host starts at ①.
 */
export type WizardStep = 0 | 1 | 2 | 3;

export function parseWizardStep(raw: string | undefined): WizardStep {
    if (raw === "0") return 0;
    if (raw === "2") return 2;
    if (raw === "3") return 3;
    return 1;
}

/**
 * URL for a given wizard step. Step ① is the bare `/workspace/new`; step ⓪
 * carries only `?step=0`; ②/③ carry the step number and the workspace id so a
 * refresh re-renders the same place. Returns a typed `Route` for
 * `<Link>`/`redirect`.
 */
export function wizardStepPath(step: WizardStep, workspaceId?: string): Route {
    if (step === 1) return "/workspace/new" as Route;
    if (step === 0) return "/workspace/new?step=0" as Route;
    if (!workspaceId) return "/workspace/new" as Route;
    const qs = new URLSearchParams({ step: String(step), ws: workspaceId });
    return `/workspace/new?${qs.toString()}` as Route;
}

/**
 * Plan step ⓪ carrying the post-checkout `billing=ok` flag. Lemon Squeezy
 * returns the subscriber to `/workspace`; the entry redirect forwards a
 * just-subscribed user here so the step renders its "Subscribed" confirmation
 * and auto-advances.
 */
export function planStepReturnedActivePath(): Route {
    return "/workspace/new?step=0&billing=ok" as Route;
}

/**
 * Subscribe-first gate for workspace creation. On cloud an owner cannot reach
 * the workspace step without an active subscription — they belong on the plan
 * step ⓪ until checkout completes. Self-host has no plan step, so it always
 * reaches workspace creation. Returns the step the user is allowed to be at.
 */
export function workspaceCreationGate({
    isCloud,
    subscribed,
}: {
    readonly isCloud: boolean;
    readonly subscribed: boolean;
}): Extract<WizardStep, 0 | 1> {
    return isCloud && !subscribed ? 0 : 1;
}
