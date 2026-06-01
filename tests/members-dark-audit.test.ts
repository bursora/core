/**
 * Dark-mode audit for the members surface. Guards against raw gray-family
 * palette tokens (gray/slate/zinc/neutral/stone) and naked white/black,
 * which bypass the semantic tokens defined in app/globals.css and break
 * light/dark parity. New colors must go through tokens (background,
 * foreground, muted, accent, border, destructive, warning, ...).
 *
 * Scope: members page + its two client components.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const MEMBERS_DIR = join(REPO_ROOT, "app", "(dashboard)", "workspace", "[workspaceId]", "members");

const SCOPE_FILES = [
    join(MEMBERS_DIR, "page.tsx"),
    join(MEMBERS_DIR, "_components", "members-list.tsx"),
    join(MEMBERS_DIR, "_components", "invite-form.tsx"),
];

// Match Tailwind class tokens like `bg-slate-100`, `text-gray-500/40`,
// `dark:border-zinc-700`, `hover:bg-neutral-200`.
const FORBIDDEN_PALETTE =
    /(?:^|[\s"'`(:])(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|placeholder|caret|accent|decoration|shadow)-(?:gray|slate|zinc|neutral|stone)-\d+(?:\/\d+)?(?=[\s"'`)/]|$)/;
const NAKED_WHITE_BLACK =
    /(?:^|[\s"'`(:])(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|placeholder|caret|accent|decoration|shadow)-(?:white|black)(?=[\s"'`)/]|$)/;

const readScopeFile = (path: string): string => readFileSync(path, "utf8");

describe("members surface dark audit", () => {
    test.each(SCOPE_FILES)("%s has no raw gray-family palette tokens", (path) => {
        const source = readScopeFile(path);
        const match = FORBIDDEN_PALETTE.exec(source);
        if (match) {
            const before = source.slice(0, match.index);
            const line = before.split(/\r?\n/).length;
            throw new Error(
                `Forbidden palette token "${match[0]}" in ${path}:${line}. ` +
                    `Use semantic tokens (bg-muted, text-muted-foreground, border-border, ...) instead.`,
            );
        }
        expect(match).toBeNull();
    });

    test.each(SCOPE_FILES)("%s has no naked white/black color classes", (path) => {
        const source = readScopeFile(path);
        const match = NAKED_WHITE_BLACK.exec(source);
        if (match) {
            const before = source.slice(0, match.index);
            const line = before.split(/\r?\n/).length;
            throw new Error(
                `Naked white/black class "${match[0].trim()}" in ${path}:${line}. ` +
                    `Use semantic tokens (bg-background, text-foreground, ...) instead.`,
            );
        }
        expect(match).toBeNull();
    });
});

describe("dark-audit regex anchoring", () => {
    test("FORBIDDEN_PALETTE matches anchored offenders", () => {
        expect(FORBIDDEN_PALETTE.test(`className="bg-slate-300"`)).toBe(true);
        expect(FORBIDDEN_PALETTE.test(`className="dark:text-gray-500/40"`)).toBe(true);
    });

    test("FORBIDDEN_PALETTE ignores semantic tokens and bare words", () => {
        expect(FORBIDDEN_PALETTE.test(`className="bg-muted text-foreground"`)).toBe(false);
        expect(FORBIDDEN_PALETTE.test(`// note: slate-300 is bad`)).toBe(false);
        expect(FORBIDDEN_PALETTE.test(`const slate300 = "neutral"`)).toBe(false);
    });
});

describe("members-list pending invite tokens", () => {
    // The pending-invite affordance needs a visible, distinct accent in
    // both themes. We route it through StatusTag with semantic tones
    // (warning + destructive) so theme inversion is handled at the token
    // layer and the surface stays in sync with other status surfaces.
    const SOURCE = readScopeFile(join(MEMBERS_DIR, "_components", "members-list.tsx"));

    test("pending invite icon chip uses the warning token, not raw amber", () => {
        expect(SOURCE).toContain("bg-warning/10");
        expect(SOURCE).toContain("text-warning");
        expect(SOURCE).not.toMatch(/\bamber-\d+\b/);
    });

    test("pending invite tag routes through the warning StatusTag tone", () => {
        expect(SOURCE).toMatch(/tone=\{expired \? "destructive" : "warning"\}/);
    });

    test("expired invite tag keeps the destructive StatusTag tone", () => {
        expect(SOURCE).toContain('tone={expired ? "destructive" : "warning"}');
    });
});
