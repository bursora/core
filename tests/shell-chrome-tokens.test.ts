/**
 * Shell chrome dark-mode token audit. Every file that draws the
 * dashboard chrome (sidebar, header, popovers, menus, palettes) must paint
 * with semantic tokens so dark mode reads. Raw Tailwind palette classes
 * (`gray-*`, `slate-*`, `zinc-*`, `neutral-*`, `stone-*`, `white`, `black`)
 * are forbidden because they ignore the `.dark` swap and leave surfaces
 * light-only.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

const SHELL_CHROME_FILES: string[] = [
    "components/shell/app-shell.tsx",
    "components/shell/sidebar-nav.tsx",
    "components/shell/workspace-header.tsx",
    "components/shell/workspace-switcher.tsx",
    "components/shell/user-menu.tsx",
    "components/shell/notification-center.tsx",
    "components/shell/command-palette.tsx",
    "components/shell/keyboard-shortcuts.tsx",
];

// Matches Tailwind utilities that reach for a raw palette ramp instead of
// a semantic token. The prefix list mirrors every color-aware Tailwind
// utility we use (bg, text, border, ring, etc.) plus modifier prefixes
// (`hover:`, `dark:`, `focus-visible:`, etc.).
const FORBIDDEN_RAMP =
    /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|placeholder|outline|decoration|caret|accent|shadow)-(?:gray|slate|zinc|neutral|stone)-\d{2,3}\b/;

// Matches `bg-white`, `text-black`, `border-white`, etc. — including
// opacity suffixes like `/10` and variant prefixes like `hover:`.
const FORBIDDEN_MONO =
    /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|placeholder|outline|decoration|caret|accent|shadow)-(?:white|black)(?:\/\d{1,3})?\b/;

function readShellFile(relativePath: string): string {
    return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("shell chrome uses semantic tokens (dark-mode audit)", () => {
    test.each(SHELL_CHROME_FILES)(
        "%s contains no raw gray/slate/zinc/neutral/stone ramp",
        (file) => {
            const source = readShellFile(file);
            const match = source.match(FORBIDDEN_RAMP);
            expect(match).toBeNull();
        },
    );

    test.each(SHELL_CHROME_FILES)("%s contains no raw white/black utilities", (file) => {
        const source = readShellFile(file);
        const match = source.match(FORBIDDEN_MONO);
        expect(match).toBeNull();
    });
});

describe("shell chrome regex catches violations", () => {
    test("forbidden ramp pattern matches a known-bad utility", () => {
        expect("text-gray-500".match(FORBIDDEN_RAMP)).not.toBeNull();
        expect("hover:bg-slate-900".match(FORBIDDEN_RAMP)).not.toBeNull();
        expect("dark:border-zinc-700".match(FORBIDDEN_RAMP)).not.toBeNull();
    });

    test("forbidden mono pattern matches white/black with opacity and variants", () => {
        expect("bg-white".match(FORBIDDEN_MONO)).not.toBeNull();
        expect("text-black/80".match(FORBIDDEN_MONO)).not.toBeNull();
        expect("hover:bg-white".match(FORBIDDEN_MONO)).not.toBeNull();
    });

    test("semantic tokens do not trigger either pattern", () => {
        const allowed = [
            "bg-background",
            "text-foreground",
            "bg-popover text-popover-foreground",
            "border-border",
            "bg-muted text-muted-foreground",
            "bg-accent text-accent-foreground",
            "bg-primary/10 text-primary",
            "bg-secondary text-secondary-foreground",
            "bg-destructive text-destructive-foreground",
        ];
        for (const cls of allowed) {
            expect(cls.match(FORBIDDEN_RAMP)).toBeNull();
            expect(cls.match(FORBIDDEN_MONO)).toBeNull();
        }
    });
});
