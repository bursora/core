/**
 * Global platform role on `users.role` — admin or user. Distinct from the
 * per-workspace `MemberRole` (owner | member) in `./member`: admin marks the
 * operator's own account and drives the admin-owned workspace exemptions
 * (rate limit, fair-use cap) and the cloud paywall bypass.
 */

export type UserRole = "admin" | "user";

export const USER_ROLE = {
    admin: "admin",
    user: "user",
} as const satisfies Record<UserRole, UserRole>;
