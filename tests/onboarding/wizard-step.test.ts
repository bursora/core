/**
 * Tests for `parseWizardStep` — the welcome wizard reads `?step` from the URL so
 * back/refresh land on the same step. Only "2" and "3" advance; everything else
 * (missing, garbage, out of range) resolves to step 1.
 */

import {
    parseWizardStep,
    planStepReturnedActivePath,
    wizardStepPath,
} from "@/lib/onboarding/wizard-step";
import { describe, expect, test } from "bun:test";

const WS = "11111111-2222-3333-4444-555555555555";

describe("parseWizardStep", () => {
    test("defaults to 1 when missing or unrecognised", () => {
        expect(parseWizardStep(undefined)).toBe(1);
        expect(parseWizardStep("1")).toBe(1);
        expect(parseWizardStep("4")).toBe(1);
        expect(parseWizardStep("two")).toBe(1);
    });

    test("parses the plan, key, and connect steps", () => {
        expect(parseWizardStep("0")).toBe(0);
        expect(parseWizardStep("2")).toBe(2);
        expect(parseWizardStep("3")).toBe(3);
    });
});

describe("wizardStepPath", () => {
    test("plan carries only the step, workspace is bare, later steps carry the id", () => {
        expect(wizardStepPath(0)).toBe("/workspace/new?step=0");
        expect(wizardStepPath(1)).toBe("/workspace/new");
        expect(wizardStepPath(2, WS)).toBe(`/workspace/new?step=2&ws=${WS}`);
        expect(wizardStepPath(3, WS)).toBe(`/workspace/new?step=3&ws=${WS}`);
    });

    test("returned-active path carries the post-checkout billing flag", () => {
        expect(planStepReturnedActivePath()).toBe("/workspace/new?step=0&billing=ok");
    });
});
