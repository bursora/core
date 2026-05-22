import {
    resolveSettingsTab,
    SETTINGS_TAB_LABELS,
    SETTINGS_TABS,
} from "@/app/(dashboard)/workspace/[workspaceId]/settings/tabs";
import { describe, expect, test } from "bun:test";

describe("SETTINGS_TABS", () => {
    test("canonical order", () => {
        expect([...SETTINGS_TABS]).toEqual([
            "general",
            "billing",
            "pricing",
            "channels",
            "activity",
        ]);
    });

    test("labels the activity tab 'Activity log'", () => {
        expect(SETTINGS_TAB_LABELS.activity).toBe("Activity log");
    });

    test("resolves ?tab=activity to the activity tab", () => {
        expect(resolveSettingsTab("activity")).toBe("activity");
    });

    test("falls back to general for unknown tab", () => {
        expect(resolveSettingsTab("notices")).toBe("general");
        expect(resolveSettingsTab(null)).toBe("general");
    });
});
