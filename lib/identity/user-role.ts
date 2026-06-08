/**
 * Global platform role on `users.role` — admin, beta, or user. Distinct from
 * the per-workspace `MemberRole` (owner | member) in `./member`.
 *
 * - `admin` marks the operator's own account and drives the admin-owned
 *   workspace exemptions (rate limit, fair-use cap) plus the cloud paywall
 *   bypass.
 * - `beta` is an operator-granted free, full-featured account: it skips the
 *   cloud subscription paywall and the onboarding pay-step, but keeps budgets,
 *   rate limits, and the fair-use cap fully enforced. Not an admin comp.
 *
 * All values are operator-granted (better-auth `input: false`); there is no
 * self-serve path to `admin` or `beta`.
 */

export type UserRole = "admin" | "beta" | "user";

export const USER_ROLE = {
    admin: "admin",
    beta: "beta",
    user: "user",
} as const satisfies Record<UserRole, UserRole>;

/**
 * Narrows the raw `users.role` text column to the platform-role union at the
 * data boundary. Round-trips every known role (admin, beta, user) so callers
 * can carry `beta`; anything else (an unknown string, null, or undefined)
 * defaults to `user`. Use this instead of an `as UserRole` cast so the value is
 * validated, not assumed.
 */
export function toUserRole(value: string | null | undefined): UserRole {
    return value === USER_ROLE.admin || value === USER_ROLE.beta ? value : USER_ROLE.user;
}

/**
 * Whether a global role is entitled to free, full-featured cloud access — i.e.
 * it bypasses the subscription paywall and the onboarding pay-step. Only `beta`
 * qualifies. `admin` is excluded on purpose: admin's broader exemptions
 * (rate-limit + fair-use bypass) run through separate axes, so it is never
 * routed through this predicate.
 */
export function roleGrantsFreeAccess(role: UserRole | string | null | undefined): boolean {
    return role === USER_ROLE.beta;
}
