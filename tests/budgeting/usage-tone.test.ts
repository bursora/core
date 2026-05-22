/**
 * Bar and text tone classes for budget usage. Three bands: under-warn,
 * warning (>= 75%), danger (>= 100%). Same thresholds drive both helpers
 * so the panel renders a coherent visual story.
 */

import {
    BUDGET_USAGE_DANGER_THRESHOLD,
    BUDGET_USAGE_WARN_THRESHOLD,
    budgetUsageBarTone,
    budgetUsageTextTone,
} from "@/lib/budgeting/usage-tone";
import { describe, expect, test } from "bun:test";

describe("budgetUsageBarTone", () => {
    test("renders the primary fill below the warn threshold", () => {
        expect(budgetUsageBarTone(0)).toBe("bg-primary/70");
        expect(budgetUsageBarTone(0.5)).toBe("bg-primary/70");
        expect(budgetUsageBarTone(0.74)).toBe("bg-primary/70");
    });

    test("flips to warning at or above 75%", () => {
        expect(budgetUsageBarTone(0.75)).toBe("bg-warning");
        expect(budgetUsageBarTone(0.99)).toBe("bg-warning");
    });

    test("flips to destructive at or above 100%", () => {
        expect(budgetUsageBarTone(1)).toBe("bg-destructive");
        expect(budgetUsageBarTone(1.5)).toBe("bg-destructive");
    });
});

describe("budgetUsageTextTone", () => {
    test("muted under warn", () => {
        expect(budgetUsageTextTone(0.5)).toBe("text-muted-foreground");
    });

    test("warning at warn band", () => {
        expect(budgetUsageTextTone(0.8)).toBe("text-warning");
    });

    test("destructive at danger band", () => {
        expect(budgetUsageTextTone(1.2)).toBe("text-destructive");
    });
});

describe("budget usage thresholds", () => {
    test("exposes the warn and danger thresholds for callers that need them", () => {
        expect(BUDGET_USAGE_WARN_THRESHOLD).toBe(0.75);
        expect(BUDGET_USAGE_DANGER_THRESHOLD).toBe(1);
    });
});
