"use server";

import { type ActionResult, actionFail, actionOk } from "@/lib/action-result";
import { requireSessionUI } from "@/lib/auth";
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
