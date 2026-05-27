"use server";

/**
 * Server actions for the /settings page. Each action is wrapped with
 * `withWorkspace` so the session + membership ctx is verified before the
 * handler body runs. Actions that require the owner role re-check
 * `ctx.membership.role` inline; everything else just needs membership.
 *
 * The workspace id always comes from the form payload — the wrapper feeds it
 * back into the membership lookup so it can't be spoofed.
 *
 * All actions return the shared `ActionResult` envelope. Success paths
 * call `redirect()` (which throws) and never actually reach the trailing
 * `return actionOk()` — the typed return is purely for clients that
 * inspect `{ ok, error, fieldErrors }` on failure.
 */

import { type ActionResult, actionFail, actionOk } from "@/lib/action-result";
import {
    optionalField,
    requireField,
    rethrowRedirect,
    workspaceIdFromForm,
    workspaceIdFromPrevForm,
} from "@/lib/actions/form-fields";
import { requestSourceIp } from "@/lib/actions/request-ip";
import { withWorkspace } from "@/lib/actions/with-workspace";
import {
    createPricingOverrideForWorkspace,
    deletePricingOverrideForWorkspace,
    saveAlertChannelsForWorkspace,
    updatePricingOverrideForWorkspace,
} from "@/lib/compose/settings";
import { emailSchema } from "@/lib/email";
import { saveEventBundleSettings } from "@/lib/event-bundle/server";
import {
    deleteWorkspace,
    issueApiKey,
    renameApiKey,
    renameWorkspace,
    revokeApiKey,
    setWorkspaceEnvironment,
} from "@/lib/identity/server";
import type { AlertChannelsInput } from "@/lib/notification";
import { buildWorkspacePath } from "@/lib/routes";
import { saveSpikeSettings } from "@/lib/spike-protection/server";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ISSUED_KEY_COOKIE, ISSUED_KEY_COOKIE_MAX_AGE } from "./issued-key-cookie";

const settingsHref = (workspaceId: string, query?: Record<string, string>): Route =>
    buildWorkspacePath(workspaceId, "settings", query);

const MAX_KEY_NAME_LENGTH = 60;
const normalizeKeyName = (raw: FormDataEntryValue | null): string =>
    typeof raw === "string" ? raw.trim().slice(0, MAX_KEY_NAME_LENGTH) : "";

export async function dismissIssuedKeyAction(): Promise<void> {
    const jar = await cookies();
    jar.set(ISSUED_KEY_COOKIE, "", { maxAge: 0, path: "/" });
}

export const issueApiKeyAction = withWorkspace(
    async (ctx, formData: FormData): Promise<void> => {
        const workspaceId = workspaceIdFromForm(formData);
        const name = normalizeKeyName(formData.get("name"));
        if (name.length === 0) {
            throw new Error("missing required field: name");
        }

        const issued = await issueApiKey({
            workspaceId,
            name,
            userId: ctx.session.user.id,
            ip: await requestSourceIp(),
        });
        const jar = await cookies();
        jar.set(ISSUED_KEY_COOKIE, issued.plaintext, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: ISSUED_KEY_COOKIE_MAX_AGE,
            path: "/",
        });

        redirect(buildWorkspacePath(workspaceId, "keys"));
    },
    { getWorkspaceId: workspaceIdFromForm },
);

export const renameApiKeyAction = withWorkspace(
    async (ctx, _prev: ActionResult, formData: FormData): Promise<ActionResult> => {
        try {
            const workspaceId = workspaceIdFromForm(formData);
            const id = requireField(formData, "keyId");
            const name = normalizeKeyName(formData.get("name"));
            if (name.length === 0) {
                return actionFail("Name is required", { name: "Name is required" });
            }

            await renameApiKey({
                id,
                workspaceId,
                name,
                userId: ctx.session.user.id,
                ip: await requestSourceIp(),
            });
            revalidatePath(settingsHref(workspaceId));
            revalidatePath(buildWorkspacePath(workspaceId, "keys"));
            return actionOk();
        } catch (err: unknown) {
            rethrowRedirect(err);
            const message = err instanceof Error ? err.message : "Failed to rename key.";
            return actionFail(message);
        }
    },
    { getWorkspaceId: workspaceIdFromPrevForm },
);

export const revokeApiKeyAction = withWorkspace(
    async (ctx, _prev: ActionResult, formData: FormData): Promise<ActionResult> => {
        try {
            const workspaceId = workspaceIdFromForm(formData);
            const id = requireField(formData, "keyId");

            await revokeApiKey({
                id,
                workspaceId,
                userId: ctx.session.user.id,
                ip: await requestSourceIp(),
            });
            revalidatePath(settingsHref(workspaceId));
            revalidatePath(buildWorkspacePath(workspaceId, "keys"));
            return actionOk();
        } catch (err: unknown) {
            rethrowRedirect(err);
            const message = err instanceof Error ? err.message : "Failed to revoke key.";
            return actionFail(message);
        }
    },
    { getWorkspaceId: workspaceIdFromPrevForm },
);

export const createPricingOverrideAction = withWorkspace(
    async (_ctx, formData: FormData): Promise<ActionResult> => {
        // Returns ActionResult so the client form (react-hook-form) can surface
        // server-side validation errors via setError without a redirect ping-pong.
        const workspaceId = workspaceIdFromForm(formData);

        const provider = requireField(formData, "provider");
        const model = requireField(formData, "model");
        const region = optionalField(formData, "region") ?? "global";
        const inputPer1mUsd = requireField(formData, "inputPer1mUsd");
        const outputPer1mUsd = requireField(formData, "outputPer1mUsd");
        const cachePer1mUsd = optionalField(formData, "cachePer1mUsd");
        const effectiveFromRaw = requireField(formData, "effectiveFrom");
        const effectiveToRaw = optionalField(formData, "effectiveTo");

        const effectiveFrom = new Date(effectiveFromRaw);
        if (Number.isNaN(effectiveFrom.getTime())) {
            return actionFail("Invalid date", { effectiveFrom: "Invalid date" });
        }

        let effectiveTo: Date | null = null;
        if (effectiveToRaw !== null) {
            effectiveTo = new Date(effectiveToRaw);
            if (Number.isNaN(effectiveTo.getTime())) {
                return actionFail("Invalid date", { effectiveTo: "Invalid date" });
            }
        }

        await createPricingOverrideForWorkspace({
            workspaceId,
            provider,
            model,
            region,
            inputPer1mUsd,
            outputPer1mUsd,
            cachePer1mUsd,
            effectiveFrom,
            effectiveTo,
        });

        revalidatePath(settingsHref(workspaceId));
        return actionOk();
    },
    { getWorkspaceId: workspaceIdFromForm },
);

export const updatePricingOverrideAction = withWorkspace(
    async (_ctx, formData: FormData): Promise<ActionResult> => {
        const workspaceId = workspaceIdFromForm(formData);
        const id = requireField(formData, "overrideId");

        const provider = requireField(formData, "provider");
        const model = requireField(formData, "model");
        const region = optionalField(formData, "region") ?? "global";
        const inputPer1mUsd = requireField(formData, "inputPer1mUsd");
        const outputPer1mUsd = requireField(formData, "outputPer1mUsd");
        const cachePer1mUsd = optionalField(formData, "cachePer1mUsd");
        const effectiveFromRaw = requireField(formData, "effectiveFrom");
        const effectiveToRaw = optionalField(formData, "effectiveTo");

        const effectiveFrom = new Date(effectiveFromRaw);
        if (Number.isNaN(effectiveFrom.getTime())) {
            return actionFail("Invalid date", { effectiveFrom: "Invalid date" });
        }

        let effectiveTo: Date | null = null;
        if (effectiveToRaw !== null) {
            effectiveTo = new Date(effectiveToRaw);
            if (Number.isNaN(effectiveTo.getTime())) {
                return actionFail("Invalid date", { effectiveTo: "Invalid date" });
            }
        }

        try {
            await updatePricingOverrideForWorkspace({
                id,
                workspaceId,
                provider,
                model,
                region,
                inputPer1mUsd,
                outputPer1mUsd,
                cachePer1mUsd,
                effectiveFrom,
                effectiveTo,
            });
        } catch (err: unknown) {
            rethrowRedirect(err);
            const message = err instanceof Error ? err.message : "Failed to update override";
            return actionFail(message);
        }

        revalidatePath(settingsHref(workspaceId));
        return actionOk();
    },
    { getWorkspaceId: workspaceIdFromForm },
);

export const deletePricingOverrideAction = withWorkspace(
    async (_ctx, formData: FormData): Promise<void> => {
        const workspaceId = workspaceIdFromForm(formData);
        const id = requireField(formData, "overrideId");

        await deletePricingOverrideForWorkspace({ workspaceId, id });
        redirect(settingsHref(workspaceId, { tab: "pricing" }));
    },
    { getWorkspaceId: workspaceIdFromForm },
);

// One submit for the whole General tab. Persists name + environment, plus
// spike-protection settings when the cloud-only section is present (detected
// by the `thresholdMultiplier` field). All fields validate up front so the
// client can surface every error at once.
export const saveGeneralSettingsAction = withWorkspace(
    async (_ctx, _prev: ActionResult, formData: FormData): Promise<ActionResult> => {
        try {
            const workspaceId = workspaceIdFromForm(formData);
            const name = (optionalField(formData, "name") ?? "").trim();
            const environment = (optionalField(formData, "environment") ?? "").trim();

            const fieldErrors: Record<string, string> = {};
            if (name.length === 0) fieldErrors.name = "Name is required";
            if (environment.length === 0) fieldErrors.environment = "Environment is required";

            const rawMultiplier = optionalField(formData, "thresholdMultiplier");
            const hasSpike = rawMultiplier !== null;
            const spikeEnabled = formData.get("enabled") === "on";
            const multiplier = hasSpike ? Number.parseFloat(rawMultiplier) : 0;
            if (hasSpike && (!Number.isFinite(multiplier) || multiplier < 2 || multiplier > 20)) {
                fieldErrors.thresholdMultiplier = "Must be between 2 and 20.";
            }

            if (Object.keys(fieldErrors).length > 0) {
                return actionFail("Check the highlighted fields.", fieldErrors);
            }

            await renameWorkspace({ id: workspaceId, name });
            await setWorkspaceEnvironment({ id: workspaceId, environment });
            if (hasSpike) {
                await saveSpikeSettings({
                    workspaceId,
                    enabled: spikeEnabled,
                    thresholdMultiplier: multiplier,
                });
            }

            revalidatePath(settingsHref(workspaceId));
            return actionOk();
        } catch (err: unknown) {
            rethrowRedirect(err);
            const message = err instanceof Error ? err.message : "Failed to save settings.";
            return actionFail(message);
        }
    },
    { getWorkspaceId: workspaceIdFromPrevForm },
);

export const deleteWorkspaceAction = withWorkspace(
    async (ctx, formData: FormData): Promise<void> => {
        const workspaceId = workspaceIdFromForm(formData);
        // withWorkspace verified membership; deletion still requires owner role.
        if (ctx.membership.role !== "owner") {
            throw new Error("owner role required");
        }

        await deleteWorkspace(workspaceId);
        redirect("/" as Route);
    },
    { getWorkspaceId: workspaceIdFromForm },
);

export const saveEventBundleAction = withWorkspace(
    async (_ctx, _prev: ActionResult, formData: FormData): Promise<ActionResult> => {
        try {
            const workspaceId = workspaceIdFromForm(formData);
            const enabled = formData.get("enabled") === "on";

            let hardCapUsdCents: number | null = null;
            if (enabled) {
                const rawCap = requireField(formData, "hardCapUsd");
                const cap = Number.parseInt(rawCap, 10);
                if (!Number.isInteger(cap) || cap < 1 || cap > 10_000) {
                    return actionFail("Cap must be between $1 and $10,000.", {
                        hardCapUsd: "Must be a whole dollar amount between 1 and 10000.",
                    });
                }
                hardCapUsdCents = cap * 100;
            }

            await saveEventBundleSettings({ workspaceId, hardCapUsdCents });
            revalidatePath(settingsHref(workspaceId));
            return actionOk();
        } catch (err: unknown) {
            rethrowRedirect(err);
            const message =
                err instanceof Error ? err.message : "Failed to save event bundle settings.";
            return actionFail(message);
        }
    },
    { getWorkspaceId: workspaceIdFromPrevForm },
);

export const saveAlertChannelsAction = withWorkspace(
    async (_ctx, formData: FormData): Promise<ActionResult> => {
        try {
            const workspaceId = workspaceIdFromForm(formData);

            const slackUrl = optionalField(formData, "slackUrl");
            const discordUrl = optionalField(formData, "discordUrl");
            const emailAddress = optionalField(formData, "emailAddress");

            const parsedEmail = emailAddress !== null ? emailSchema.safeParse(emailAddress) : null;
            if (parsedEmail && !parsedEmail.success) {
                return actionFail("alert email address must be a valid email", {
                    emailAddress: "alert email address must be a valid email",
                });
            }

            const input: AlertChannelsInput = {
                ...(slackUrl !== null ? { slack: { url: slackUrl } } : {}),
                ...(discordUrl !== null ? { discord: { url: discordUrl } } : {}),
                ...(parsedEmail?.success ? { email: { address: parsedEmail.data } } : {}),
            };

            await saveAlertChannelsForWorkspace({ workspaceId, input });
            revalidatePath(settingsHref(workspaceId));
            return actionOk();
        } catch (err: unknown) {
            rethrowRedirect(err);
            const message = err instanceof Error ? err.message : "Failed to save channels.";
            return actionFail(message);
        }
    },
    { getWorkspaceId: workspaceIdFromForm },
);
