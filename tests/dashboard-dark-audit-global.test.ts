/**
 * Global dark-mode regression guard for the dashboard surface.
 *
 * Per-surface audits (spend, alerts, keys, members, settings,
 * profile, landing, shell chrome) lock the files known to exist today.
 * This test is the catch-all: it walks every TypeScript/TSX file under
 * `app/(dashboard)/**` and `components/**` so any new dashboard file
 * added later cannot regress the theme with raw palette tokens.
 *
 * Forbidden in dashboard code:
 *   - Raw grayscale ramps (`gray-*`, `slate-*`, `zinc-*`, `neutral-*`,
 *     `stone-*`) — there is no theme-aware counterpart; both modes must
 *     derive from semantic tokens in `app/globals.css`.
 *   - Mono literals (`bg-white`, `text-black`, ...) — pin one luminance.
 *   - Hex colors in `className` strings — bypass the token system.
 *
 * Allow-list narrowly captures files that legitimately need raw palette:
 *   - `components/ui/**`: shadcn primitives use upstream conventions
 *     (`bg-black/50` overlays, `text-white` on `bg-destructive` variants).
 *     Per-surface audits already cover the surface code that consumes
 *     these primitives. Also home to `brand/*` brand-mark SVGs whose hex
 *     colors are sourced from each service's brand guidelines.
 *   - Status-badge files: emerald/amber/rose ramps paired with `dark:`
 *     variants on a per-status basis. These are NOT in the forbidden
 *     ramp list, so no allow-list entry is needed.
 *
 * If this test fails, swap the offending raw class for a semantic token
 * (`bg-background`, `text-muted-foreground`, `border-border`,
 * `bg-warning`, `bg-destructive`, ...).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

const SCAN_ROOTS = ["app/(dashboard)", "components"] as const;

const ALLOW_LISTED_PREFIXES = [
    // shadcn primitives: upstream conventions (overlay `bg-black/50`,
    // `text-white` on destructive). Per-surface audits cover consumers.
    // Also covers `components/ui/brand/*` brand marks whose hex colors
    // come from each service's brand guidelines.
    "components/ui/",
] as const;

const COLOR_UTILITIES = [
    "bg",
    "text",
    "border",
    "ring",
    "fill",
    "stroke",
    "from",
    "to",
    "via",
    "divide",
    "outline",
    "shadow",
    "placeholder",
    "caret",
    "accent",
    "decoration",
] as const;

const FORBIDDEN_RAMPS = ["gray", "slate", "zinc", "neutral", "stone"] as const;

const FORBIDDEN_RAMP = new RegExp(
    String.raw`\b(?:${COLOR_UTILITIES.join("|")})-(?:${FORBIDDEN_RAMPS.join("|")})-\d{2,3}(?:\/\d+)?\b`,
    "g",
);

const FORBIDDEN_MONO = new RegExp(
    String.raw`\b(?:${COLOR_UTILITIES.join("|")})-(?:white|black)(?:\/\d{1,3})?\b`,
    "g",
);

// Hex colors that appear inside JSX className strings. Anchored on
// `className=` so SVG `fill="#..."` attributes and unrelated literals
// don't trip the guard.
const HEX_IN_CLASSNAME = /className=(?:"|'|\{`)[^"'`]*#[0-9a-fA-F]{3,8}\b/g;

function walk(dir: string): string[] {
    const entries = readdirSync(dir);
    const files: string[] = [];
    for (const entry of entries) {
        if (entry === "node_modules" || entry === ".next" || entry === ".tsout") continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            files.push(...walk(full));
            continue;
        }
        if (/\.(?:ts|tsx)$/.test(entry)) {
            files.push(full);
        }
    }
    return files;
}

function isAllowListed(relPath: string): boolean {
    return ALLOW_LISTED_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function collectScannedFiles(): string[] {
    const files: string[] = [];
    for (const root of SCAN_ROOTS) {
        files.push(...walk(join(REPO_ROOT, root)));
    }
    return files
        .map((abs) => relative(REPO_ROOT, abs))
        .filter((rel) => !isAllowListed(rel))
        .sort();
}

function findOffenders(source: string): string[] {
    return [
        ...(source.match(FORBIDDEN_RAMP) ?? []),
        ...(source.match(FORBIDDEN_MONO) ?? []),
        ...(source.match(HEX_IN_CLASSNAME) ?? []),
    ];
}

describe("global dashboard dark-audit: regex catches violations", () => {
    test("ramp pattern matches raw grayscale ramps with prefixes and variants", () => {
        expect("text-gray-500".match(FORBIDDEN_RAMP)).not.toBeNull();
        expect("dark:bg-slate-900".match(FORBIDDEN_RAMP)).not.toBeNull();
        expect("hover:border-zinc-200/40".match(FORBIDDEN_RAMP)).not.toBeNull();
        expect("text-neutral-700".match(FORBIDDEN_RAMP)).not.toBeNull();
        expect("bg-stone-100".match(FORBIDDEN_RAMP)).not.toBeNull();
    });

    test("mono pattern matches white/black with opacity and variants", () => {
        expect("bg-white".match(FORBIDDEN_MONO)).not.toBeNull();
        expect("text-black/80".match(FORBIDDEN_MONO)).not.toBeNull();
        expect("hover:bg-white".match(FORBIDDEN_MONO)).not.toBeNull();
        expect("bg-black/50".match(FORBIDDEN_MONO)).not.toBeNull();
    });

    test("hex-in-classname pattern matches hex literals inside className", () => {
        expect(`className="text-[#abc123]"`.match(HEX_IN_CLASSNAME)).not.toBeNull();
        expect(`className="bg-[#ffffff]"`.match(HEX_IN_CLASSNAME)).not.toBeNull();
    });

    test("semantic tokens do not trigger the ramp or mono pattern", () => {
        for (const cls of [
            "bg-background",
            "text-foreground",
            "bg-card text-card-foreground",
            "bg-popover text-popover-foreground",
            "border-border",
            "bg-muted text-muted-foreground",
            "bg-accent text-accent-foreground",
            "bg-primary/10 text-primary",
            "bg-secondary text-secondary-foreground",
            "bg-destructive text-destructive-foreground",
            "bg-warning text-warning-foreground",
            "border-warning",
            "ring-ring",
        ]) {
            expect(cls.match(FORBIDDEN_RAMP)).toBeNull();
            expect(cls.match(FORBIDDEN_MONO)).toBeNull();
        }
    });

    test("paired-status ramps (emerald/amber/rose with dark variants) are not forbidden", () => {
        // These belong to status semantics and ship with `dark:` variants;
        // they are out of scope for this guard, which targets only
        // grayscale ramps and mono literals.
        const allowed = [
            "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
            "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
            "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
        ];
        for (const cls of allowed) {
            expect(cls.match(FORBIDDEN_RAMP)).toBeNull();
            expect(cls.match(FORBIDDEN_MONO)).toBeNull();
        }
    });

    test("svg fill attributes do not trip the hex-in-classname pattern", () => {
        expect(`<path fill="#E01E5A" d="..." />`.match(HEX_IN_CLASSNAME)).toBeNull();
    });
});

describe("global dashboard dark-audit: every scanned file is clean", () => {
    const scannedFiles = collectScannedFiles();

    test("scan covers a non-trivial number of files", () => {
        // Sanity: if the walker breaks (wrong dirs, bad filter), this
        // test catches the silent zero-files regression.
        expect(scannedFiles.length).toBeGreaterThan(20);
    });

    test.each(scannedFiles)("%s uses only semantic theme tokens", (relPath) => {
        const source = readFileSync(join(REPO_ROOT, relPath), "utf8");
        const offenders = findOffenders(source);
        expect(offenders, `forbidden token(s) in ${relPath}: ${offenders.join(", ")}`).toEqual([]);
    });
});

describe("sidebar header chrome paints with dark-mode-aware tokens", () => {
    // Positive lock: the new workspace header row in the sidebar pulls
    // semantic tokens for the sub-line and delegates the avatar to the
    // paired-palette helper so both themes read. If any of these drop,
    // we'd ship a light-only header — catch it here, not in QA.
    const headerSource = readFileSync(
        join(REPO_ROOT, "components/shell/workspace-header.tsx"),
        "utf8",
    );
    const avatarSource = readFileSync(join(REPO_ROOT, "lib/avatar.ts"), "utf8");

    test("sub-line uses text-muted-foreground", () => {
        expect(headerSource).toContain("text-muted-foreground");
    });

    test("primary name line uses text-foreground", () => {
        expect(headerSource).toContain("text-foreground");
    });

    test("workspace avatar palette ships paired light + dark backgrounds", () => {
        // Each palette entry must pair a light bg with a dark bg so the
        // chip survives the .dark theme swap.
        expect(avatarSource).toMatch(/bg-\w+-100/);
        expect(avatarSource).toMatch(/dark:bg-\w+-900\/40/);
    });
});
