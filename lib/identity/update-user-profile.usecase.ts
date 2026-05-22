import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import "server-only";

export interface UpdateUserProfileInput {
    readonly userId: string;
    readonly name: string;
}

export async function updateUserProfileUseCase(input: UpdateUserProfileInput): Promise<void> {
    const result = await db()
        .update(schema.users)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(schema.users.id, input.userId))
        .returning({ id: schema.users.id });

    if (result.length === 0) {
        throw new Error("User not found");
    }
}
