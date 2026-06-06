import "server-only";

import { anonymousId } from "./server-capture";

/**
 * Opaque person + group identity for the client PostHog instance, computed
 * server-side so the client `distinct_id` is byte-for-byte the same hash the
 * server funnel events use (`anonymousId`). Both sides attribute to one person
 * without ever shipping a raw id, email, or name to PostHog.
 *
 * The client provider receives this shape as plain props and forwards it to
 * `posthog.identify` / `posthog.group`; it never recomputes a hash, so the two
 * sides can't drift.
 */
export interface Identity {
    /** Hashed actor id. Equals `anonymousId(userId)`. */
    readonly distinctId: string;
    /** PostHog group type key. */
    readonly groupType: "workspace";
    /** Hashed workspace id, or null when no workspace is in context. */
    readonly groupKey: string | null;
}

export interface BuildIdentityInput {
    readonly userId: string;
    readonly workspaceId: string | null;
}

export function buildIdentity({ userId, workspaceId }: BuildIdentityInput): Identity {
    return {
        distinctId: anonymousId(userId),
        groupType: "workspace",
        groupKey: workspaceId ? anonymousId(workspaceId) : null,
    };
}
