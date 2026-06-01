/**
 * Tests for `deriveActivationState` — the pure core of the onboarding
 * activation resolver. Asserts each of the 5 booleans against seeded
 * permutations (no key, only-revoked key, one live key, one event, one
 * budget, second member) and that the dismissed flag passes through.
 */

import { deriveActivationState, type ActivationInputs } from "@/lib/onboarding/activation-state";
import { describe, expect, test } from "bun:test";

const EMPTY: ActivationInputs = {
    apiKeys: [],
    eventCount: 0,
    budgetCount: 0,
    memberCount: 1,
    pendingInviteCount: 0,
    dismissed: false,
};

describe("deriveActivationState", () => {
    test("workspaceCreated is always true", () => {
        expect(deriveActivationState(EMPTY).workspaceCreated).toBe(true);
    });

    test("apiKeyIssued is false with no keys", () => {
        expect(deriveActivationState(EMPTY).apiKeyIssued).toBe(false);
    });

    test("apiKeyIssued is false when the only key is revoked", () => {
        const state = deriveActivationState({
            ...EMPTY,
            apiKeys: [{ revokedAt: new Date("2026-01-01T00:00:00Z") }],
        });
        expect(state.apiKeyIssued).toBe(false);
    });

    test("apiKeyIssued is true with a live, non-revoked key", () => {
        const state = deriveActivationState({
            ...EMPTY,
            apiKeys: [{ revokedAt: null }, { revokedAt: new Date() }],
        });
        expect(state.apiKeyIssued).toBe(true);
    });

    test("firstEventSent tracks event count > 0", () => {
        expect(deriveActivationState(EMPTY).firstEventSent).toBe(false);
        expect(deriveActivationState({ ...EMPTY, eventCount: 1 }).firstEventSent).toBe(true);
    });

    test("budgetSet tracks budget count > 0", () => {
        expect(deriveActivationState(EMPTY).budgetSet).toBe(false);
        expect(deriveActivationState({ ...EMPTY, budgetCount: 1 }).budgetSet).toBe(true);
    });

    test("teammateInvited is false with only the owner and true with a second member", () => {
        expect(deriveActivationState(EMPTY).teammateInvited).toBe(false);
        expect(deriveActivationState({ ...EMPTY, memberCount: 2 }).teammateInvited).toBe(true);
    });

    test("teammateInvited is true with a pending invite, before it's accepted", () => {
        expect(deriveActivationState({ ...EMPTY, pendingInviteCount: 1 }).teammateInvited).toBe(
            true,
        );
    });

    test("dismissed passes through", () => {
        expect(deriveActivationState(EMPTY).dismissed).toBe(false);
        expect(deriveActivationState({ ...EMPTY, dismissed: true }).dismissed).toBe(true);
    });
});
