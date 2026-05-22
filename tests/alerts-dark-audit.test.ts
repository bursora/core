/**
 * Dark-audit regression lock for the alerts feed.
 *
 * The alerts route lives in five files; each must stick to semantic theme
 * tokens (`bg-background`, `text-foreground`, `bg-muted`, etc.) so light and
 * dark modes derive from the same CSS variables. Raw Tailwind palette
 * (`gray-500`, `bg-white`, `text-black`, ...) bakes a single luminance into
 * the markup and breaks one of the two themes.
 *
 * This test fails the moment any forbidden token re-appears in the scoped
 * files. Run after touching the alerts UI to catch regressions before review.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

const SCOPED_FILES = [
    "app/(dashboard)/workspace/[workspaceId]/alerts/page.tsx",
    "app/(dashboard)/workspace/[workspaceId]/alerts/loading.tsx",
    "app/(dashboard)/workspace/[workspaceId]/alerts/_components/alert-row.tsx",
    "app/(dashboard)/workspace/[workspaceId]/alerts/_components/severity-sign.tsx",
] as const;

// Raw Tailwind palette ramps that have no theme-aware counterpart.
const FORBIDDEN_RAMPS = ["gray", "slate", "zinc", "neutral", "stone"] as const;

// Class utilities that take a color value; each pairs with `white`/`black` to
// form a forbidden literal (e.g. `bg-white`, `text-black`, `border-white/10`).
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

function findForbidden(source: string): string[] {
    const hits: string[] = [];

    // gray-500, slate-50, zinc-900, ...
    const rampPattern = new RegExp(String.raw`\b(?:${FORBIDDEN_RAMPS.join("|")})-\d{2,3}\b`, "g");
    hits.push(...(source.match(rampPattern) ?? []));

    // bg-white, text-black, border-white/10, ...
    const literalPattern = new RegExp(
        String.raw`\b(?:${COLOR_UTILITIES.join("|")})-(?:white|black)(?:\/\d+)?\b`,
        "g",
    );
    hits.push(...(source.match(literalPattern) ?? []));

    return hits;
}

describe("alerts feed dark-audit", () => {
    for (const relativePath of SCOPED_FILES) {
        test(`${relativePath} uses only semantic theme tokens`, () => {
            const source = readFileSync(join(REPO_ROOT, relativePath), "utf8");
            const offenders = findForbidden(source);
            expect(offenders).toEqual([]);
        });
    }
});
