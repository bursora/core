/**
 * Account lifecycle status on `users.status`.
 *
 * `active` is the normal state. `pending_deletion` marks an account the user
 * asked to delete: it sits in a 24h grace window with its API keys suspended,
 * and is hard-purged by the account-purge cron once `deletion_scheduled_at`
 * passes. Signing back in during the window flips it back to `active`.
 */

export type UserStatus = "active" | "pending_deletion";

export const USER_STATUS = {
    active: "active",
    pendingDeletion: "pending_deletion",
} as const satisfies Record<string, UserStatus>;
