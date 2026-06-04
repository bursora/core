"use server";

import { type ActionResult, actionFail, actionOk } from "@/lib/action-result";
import { requireSessionUI } from "@/lib/auth";
import { AccountDeletionBlockedError } from "@/lib/identity";
import { requestAccountDeletion } from "@/lib/identity/server";
import { updateUserProfileUseCase } from "@/lib/identity/update-user-profile.usecase";
import { revalidatePath } from "next/cache";
import { updateProfileSchema } from "./validation";

export async function updateProfileAction(
    _prev: ActionResult,
    formData: FormData,
): Promise<ActionResult> {
    const session = await requireSessionUI();

    const parsed = updateProfileSchema.safeParse({
        name: formData.get("name"),
    });
    if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Invalid input";
        return actionFail(message, { name: message });
    }

    try {
        await updateUserProfileUseCase({
            userId: session.user.id,
            name: parsed.data.name,
        });
        revalidatePath("/", "layout");
        return actionOk();
    } catch {
        return actionFail("Could not save");
    }
}

/**
 * Schedules deletion of the signed-in user's account (GDPR erasure, 24h grace).
 * The account is suspended and its keys stop working immediately; the client
 * clears the session and redirects on success. A blocked deletion comes back as
 * an error naming the workspaces whose ownership must move first.
 */
export async function deleteAccountAction(formData: FormData): Promise<ActionResult> {
    const session = await requireSessionUI();

    // The dialog gates on typing the email; re-check server-side so the action
    // can't be driven without it.
    const confirmation = String(formData.get("confirmEmail") ?? "")
        .trim()
        .toLowerCase();
    if (confirmation !== session.user.email.toLowerCase()) {
        return actionFail("Type your email to confirm.");
    }

    try {
        await requestAccountDeletion({ userId: session.user.id, email: session.user.email });
    } catch (err: unknown) {
        if (err instanceof AccountDeletionBlockedError) {
            const names = err.workspaces.map((w) => w.name).join(", ");
            return actionFail(`Make another member an owner in these workspaces first: ${names}.`);
        }
        return actionFail("Could not delete your account. Try again.");
    }

    return actionOk();
}
