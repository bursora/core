import type { UserStatus } from "./user-status";

export interface UserRepository {
    /**
     * Deletes the user row. Postgres cascades remove the user's sessions,
     * OAuth accounts, subscription, workspace memberships, sent invites, and
     * notifications; `api_key_audit_log.user_id` is set null (the log survives,
     * attribution drops).
     */
    delete(userId: string): Promise<void>;

    /** Account lifecycle status, or null when the user is unknown. */
    getStatus(userId: string): Promise<UserStatus | null>;

    /**
     * Flags the account for deletion: status → `pending_deletion`,
     * `deletion_scheduled_at` → the given instant (end of the grace window).
     */
    scheduleDeletion(userId: string, scheduledAt: Date): Promise<void>;

    /**
     * Reverts a pending deletion: status → `active`, `deletion_scheduled_at`
     * → null. No-op if the account is not pending.
     */
    cancelDeletion(userId: string): Promise<void>;

    /** User ids whose grace window has elapsed (`deletion_scheduled_at <= now`). */
    listDueForPurge(now: Date): Promise<readonly string[]>;

    /** Deletes the user's sessions, forcing sign-out on every device. */
    clearSessions(userId: string): Promise<void>;
}
