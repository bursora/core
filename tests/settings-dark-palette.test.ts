/**
 * Settings surface dark-mode audit. Asserts that the settings tab cluster
 * routes all surface colors through semantic tokens — never raw greyscale
 * palette utilities (`slate-*`, `gray-*`, `zinc-*`, `neutral-*`, `stone-*`,
 * `bg-white`, `text-black`, etc.).
 *
 * Replacing greyscale palette with `bg-muted`, `text-muted-foreground`,
 * `bg-card`, and friends is what keeps both light and dark themes
 * legible without per-class `dark:` overrides.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SETTINGS = "app/(dashboard)/workspace/[workspaceId]/settings";

const SCOPED_FILES: readonly string[] = [
    `${SETTINGS}/page.tsx`,
    `${SETTINGS}/_components/tabs-client.tsx`,
    `${SETTINGS}/_components/general-section.tsx`,
    `${SETTINGS}/_components/rename-workspace-form.tsx`,
    `${SETTINGS}/_components/alert-channels-section.tsx`,
    `${SETTINGS}/_components/alert-channels-form.tsx`,
    `${SETTINGS}/_components/pricing-overrides-panel.tsx`,
    `${SETTINGS}/_components/pricing-override-section.tsx`,
    `${SETTINGS}/_components/pricing-override-form.tsx`,
    `${SETTINGS}/_components/activity-tab.tsx`,
    `${SETTINGS}/_components/delete-workspace-dialog.tsx`,
];

// Banned greyscale palette utilities. The numeric suffix matches any
// Tailwind shade. Also catches opacity modifiers like `bg-slate-800/60`.
const BANNED_PATTERN =
    /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder|outline|caret|accent|decoration|shadow)-(?:slate|gray|zinc|neutral|stone)-\d{2,3}\b/;

// Raw white/black color utilities (not the same as `bg-background` etc.).
const RAW_BW_PATTERN = /\b(?:bg|text|border|ring|fill|stroke|divide|from|to|via)-(?:white|black)\b/;

function readScoped(relPath: string): string {
    return readFileSync(join(ROOT, relPath), "utf8");
}

describe("settings surface routes greyscale through semantic tokens", () => {
    for (const file of SCOPED_FILES) {
        test(`${file} has no raw slate/gray/zinc/neutral/stone palette`, () => {
            const source = readScoped(file);
            const match = source.match(BANNED_PATTERN);
            expect(match).toBeNull();
        });

        test(`${file} has no raw bg-white / text-black palette`, () => {
            const source = readScoped(file);
            const match = source.match(RAW_BW_PATTERN);
            expect(match).toBeNull();
        });
    }
});
