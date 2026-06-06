/**
 * Tests for `workspaceCreationGate` — the subscribe-first gate on cloud. An owner
 * cannot reach workspace creation (step 1) without an active subscription; they
 * are sent to the plan step (step 0) until checkout completes. Self-host has no
 * plan step, so it always reaches workspace creation.
 */

import { workspaceCreationGate } from "@/lib/onboarding/wizard-step";
import { describe, expect, test } from "bun:test";

describe("workspaceCreationGate", () => {
    test("cloud + unsubscribed is gated to the plan step", () => {
        expect(workspaceCreationGate({ isCloud: true, subscribed: false })).toBe(0);
    });

    test("cloud + subscribed reaches workspace creation", () => {
        expect(workspaceCreationGate({ isCloud: true, subscribed: true })).toBe(1);
    });

    test("self-host reaches workspace creation regardless of subscription", () => {
        expect(workspaceCreationGate({ isCloud: false, subscribed: false })).toBe(1);
        expect(workspaceCreationGate({ isCloud: false, subscribed: true })).toBe(1);
    });
});
