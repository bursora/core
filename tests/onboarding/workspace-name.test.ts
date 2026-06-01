/**
 * Tests for `deriveOnboardingWorkspaceName` — the step ① prefill. First
 * whitespace token of the name, then the email local-part, then empty.
 */

import { deriveOnboardingWorkspaceName } from "@/lib/onboarding/workspace-name";
import { describe, expect, test } from "bun:test";

describe("deriveOnboardingWorkspaceName", () => {
    test("uses the first token of the account name", () => {
        expect(deriveOnboardingWorkspaceName({ name: "Ada Lovelace", email: "ada@x.io" })).toBe(
            "Ada's Workspace",
        );
        expect(deriveOnboardingWorkspaceName({ name: "Ada", email: "ada@x.io" })).toBe(
            "Ada's Workspace",
        );
    });

    test("falls back to the email local-part when the name is blank", () => {
        expect(deriveOnboardingWorkspaceName({ name: "", email: "bob@example.com" })).toBe(
            "bob's Workspace",
        );
        expect(deriveOnboardingWorkspaceName({ name: "   ", email: "bob@example.com" })).toBe(
            "bob's Workspace",
        );
    });

    test("is empty when both name and email are missing", () => {
        expect(deriveOnboardingWorkspaceName({ name: null, email: null })).toBe("");
        expect(deriveOnboardingWorkspaceName({ name: "", email: "" })).toBe("");
    });
});
