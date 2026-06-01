/**
 * Pure derivation of a workspace's onboarding activation state from already
 * fetched counts. Five booleans drive both onboarding surfaces (the spend
 * empty-state and the setup widget); a sixth flag carries the dismissed bit.
 *
 * Definitions match the docs: a workspace is activated step by step as it
 * issues a live key, sends its first event, sets a budget, and invites a
 * teammate. `workspaceCreated` is always true once the resolver runs — the
 * caller only resolves state for a workspace that already exists.
 *
 * No clock, no DB, no cookies. The server wiring in `./server` fetches the
 * counts and reads the dismiss cookie, then calls this.
 */

export interface ActivationState {
    readonly workspaceCreated: boolean;
    readonly apiKeyIssued: boolean;
    readonly firstEventSent: boolean;
    readonly budgetSet: boolean;
    readonly teammateInvited: boolean;
    readonly dismissed: boolean;
}

export interface ActivationInputs {
    readonly apiKeys: ReadonlyArray<{ readonly revokedAt: Date | null }>;
    readonly eventCount: number;
    readonly budgetCount: number;
    readonly memberCount: number;
    /** Outstanding (not-yet-accepted) invites; a sent invite counts as invited. */
    readonly pendingInviteCount: number;
    readonly dismissed: boolean;
}

export function deriveActivationState(input: ActivationInputs): ActivationState {
    return {
        workspaceCreated: true,
        apiKeyIssued: input.apiKeys.some((k) => k.revokedAt === null),
        firstEventSent: input.eventCount > 0,
        budgetSet: input.budgetCount > 0,
        // A second member who joined, or an invite already sent — either way the
        // owner has invited someone, so the step is done.
        teammateInvited: input.memberCount > 1 || input.pendingInviteCount > 0,
        dismissed: input.dismissed,
    };
}
