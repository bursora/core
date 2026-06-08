import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { toUserRole, type UserRole } from "./user-role";
import { USER_STATUS, type UserStatus } from "./user-status";
import type { UserRepository } from "./user.repository";

export class DrizzleUserRepository implements UserRepository {
    constructor(private readonly db: Db) {}

    async getRole(userId: string): Promise<UserRole | null> {
        const [row] = await this.db
            .select({ role: schema.users.role })
            .from(schema.users)
            .where(eq(schema.users.id, userId))
            .limit(1);
        // No row → the user is gone; signal that with null. Otherwise narrow the
        // raw `users.role` text column (admin|beta|user) through the validated
        // `toUserRole` rather than asserting it with a cast.
        if (!row) return null;
        return toUserRole(row.role);
    }

    async delete(userId: string): Promise<void> {
        await this.db.delete(schema.users).where(eq(schema.users.id, userId));
    }

    async getStatus(userId: string): Promise<UserStatus | null> {
        const [row] = await this.db
            .select({ status: schema.users.status })
            .from(schema.users)
            .where(eq(schema.users.id, userId))
            .limit(1);
        if (!row) return null;
        return row.status === USER_STATUS.pendingDeletion
            ? USER_STATUS.pendingDeletion
            : USER_STATUS.active;
    }

    async scheduleDeletion(userId: string, scheduledAt: Date): Promise<void> {
        await this.db
            .update(schema.users)
            .set({ status: USER_STATUS.pendingDeletion, deletionScheduledAt: scheduledAt })
            .where(eq(schema.users.id, userId));
    }

    async cancelDeletion(userId: string): Promise<void> {
        await this.db
            .update(schema.users)
            .set({ status: USER_STATUS.active, deletionScheduledAt: null })
            .where(eq(schema.users.id, userId));
    }

    async listDueForPurge(now: Date): Promise<readonly string[]> {
        const rows = await this.db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(
                and(
                    eq(schema.users.status, USER_STATUS.pendingDeletion),
                    isNotNull(schema.users.deletionScheduledAt),
                    lte(schema.users.deletionScheduledAt, now),
                ),
            );
        return rows.map((r) => r.id);
    }

    async clearSessions(userId: string): Promise<void> {
        await this.db.delete(schema.session).where(eq(schema.session.userId, userId));
    }
}
