/**
 * Pure reducer for the optimistic API key revoke flow. The status pill
 * flips to "revoked" instantly and reverts on server failure. Keeping
 * the logic outside the React tree makes it testable and shareable.
 */

export type RevokeState = "active" | "revoking" | "revoked";

export type RevokeAction = "begin" | "confirm" | "rollback";

export function revokeReducer(state: RevokeState, action: RevokeAction): RevokeState {
    switch (action) {
        case "begin":
            return state === "active" ? "revoking" : state;
        case "confirm":
            return "revoked";
        case "rollback":
            return state === "revoking" ? "active" : state;
    }
}

export function revokeBadgeLabel(state: RevokeState): string {
    return state === "active" ? "Active" : "Revoked";
}
