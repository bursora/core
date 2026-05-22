/**
 * Regression guard for the API keys section: ensures no raw Tailwind
 * palette tokens (gray-*, slate-*, zinc-*, neutral-*, stone-*, plain
 * white / black) leak into the keys route or its inline components.
 * Both themes are driven entirely by semantic tokens declared in
 * app/globals.css (bg-background, text-foreground, bg-card, bg-muted,
 * bg-popover, border-border, text-muted-foreground, bg-accent,
 * bg-destructive, bg-warning, etc.).
 *
 * If this test fails, swap the raw palette class for a semantic token.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

const SCOPED_FILES = [
    "app/(dashboard)/workspace/[workspaceId]/keys/page.tsx",
    "app/(dashboard)/workspace/[workspaceId]/keys/_components/api-keys-section.tsx",
    "app/(dashboard)/workspace/[workspaceId]/keys/_components/api-keys-section-controls.tsx",
    "app/(dashboard)/workspace/[workspaceId]/keys/_components/api-key-row.tsx",
    "app/(dashboard)/workspace/[workspaceId]/keys/_components/issued-key-card.tsx",
    "app/(dashboard)/workspace/[workspaceId]/keys/_components/rename-api-key-dialog.tsx",
    "app/(dashboard)/workspace/[workspaceId]/keys/_components/danger-confirm.tsx",
] as const;

// Match `bg-gray-500`, `dark:text-slate-300`, `hover:border-zinc-200/40`,
// `text-white`, `bg-black`, etc. Allows the standard utility prefixes
// (bg, text, border, ring, from, to, via, fill, stroke, outline, divide,
// shadow, placeholder, accent, caret, decoration). Skips matches inside
// import paths by anchoring on a class-attribute style boundary.
const FORBIDDEN_PALETTE =
    /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|shadow|placeholder|accent|caret|decoration)-(?:gray|slate|zinc|neutral|stone)-\d+\b/;
const FORBIDDEN_BW =
    /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|placeholder|accent|caret|decoration)-(?:white|black)\b/;

const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("api keys section: regex catches forbidden palette tokens", () => {
    test("flags raw gray/slate/zinc/neutral/stone scales", () => {
        expect(FORBIDDEN_PALETTE.test("bg-gray-500")).toBe(true);
        expect(FORBIDDEN_PALETTE.test("dark:text-slate-300")).toBe(true);
        expect(FORBIDDEN_PALETTE.test("hover:border-zinc-200/40")).toBe(true);
        expect(FORBIDDEN_PALETTE.test("text-neutral-700")).toBe(true);
        expect(FORBIDDEN_PALETTE.test("bg-stone-100")).toBe(true);
    });

    test("flags plain white and black backgrounds, borders, and text", () => {
        expect(FORBIDDEN_BW.test("bg-white")).toBe(true);
        expect(FORBIDDEN_BW.test("text-black")).toBe(true);
        expect(FORBIDDEN_BW.test("border-white")).toBe(true);
    });

    test("does not flag semantic tokens", () => {
        for (const cls of [
            "bg-background",
            "text-foreground",
            "bg-card",
            "text-card-foreground",
            "bg-popover",
            "border-border",
            "bg-muted",
            "text-muted-foreground",
            "bg-accent",
            "bg-destructive",
            "text-destructive",
            "bg-warning/10",
            "border-warning",
            "text-warning",
            "bg-primary",
            "bg-secondary",
        ]) {
            expect(FORBIDDEN_PALETTE.test(cls)).toBe(false);
            expect(FORBIDDEN_BW.test(cls)).toBe(false);
        }
    });
});

describe("api keys section: scoped files use semantic tokens only", () => {
    for (const rel of SCOPED_FILES) {
        test(`${rel} contains no raw palette colors`, () => {
            const source = read(rel);
            const paletteMatch = source.match(FORBIDDEN_PALETTE);
            const bwMatch = source.match(FORBIDDEN_BW);
            expect(
                paletteMatch,
                `forbidden palette token in ${rel}: ${paletteMatch?.[0]}`,
            ).toBeNull();
            expect(bwMatch, `forbidden bw token in ${rel}: ${bwMatch?.[0]}`).toBeNull();
        });
    }
});
