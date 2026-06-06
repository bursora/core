/**
 * The client-side person identity must attribute to the SAME person the
 * server-side funnel events do. That parity hinges on one rule: the client
 * `distinct_id` is the server's `anonymousId(userId)`, computed server-side and
 * passed down — never a second hash. These tests pin that parity and the
 * no-PII shape of the identify/group payloads (the privacy contract).
 */

import { buildIdentity } from "@/lib/analytics/identity";
import { anonymousId } from "@/lib/analytics/server-capture";
import { describe, expect, test } from "bun:test";

describe("buildIdentity", () => {
    test("distinct id equals the server-side anonymousId for the same user", () => {
        const identity = buildIdentity({ userId: "user-123", workspaceId: null });
        expect(identity.distinctId).toBe(anonymousId("user-123"));
    });

    test("group id equals the server-side anonymousId for the workspace", () => {
        const identity = buildIdentity({ userId: "user-123", workspaceId: "ws-9" });
        expect(identity.groupKey).toBe(anonymousId("ws-9"));
        expect(identity.groupType).toBe("workspace");
    });

    test("omits the group when no workspace is in context", () => {
        const identity = buildIdentity({ userId: "user-123", workspaceId: null });
        expect(identity.groupKey).toBeNull();
    });

    test("carries no PII: ids are opaque and there is no email or name", () => {
        const identity = buildIdentity({ userId: "user-123", workspaceId: "ws-9" });
        const serialized = JSON.stringify(identity);
        expect(serialized).not.toContain("user-123");
        expect(serialized).not.toContain("ws-9");
        expect(serialized).not.toContain("@");
        expect(serialized.toLowerCase()).not.toContain("email");
        expect(serialized.toLowerCase()).not.toContain("name");
    });
});
