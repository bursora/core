/**
 * Dark-audit regression lock for the profile section and workspace-level
 * landing surfaces (workspace list, new-workspace form, dashboard root,
 * setup-errors banner, dashboard error boundary).
 *
 * These files must stick to semantic theme tokens (`bg-background`,
 * `text-foreground`, `bg-card`, `bg-muted`, `text-muted-foreground`,
 * `bg-popover`, `border-border`, `bg-accent`, `bg-destructive`, `bg-warning`,
 * ...) so light and dark modes derive from the same CSS variables. Raw
 * Tailwind palette ramps (`gray-500`, `slate-300`, ...) or plain
 * `white`/`black` literals bake a single luminance into the markup and break
 * one of the two themes.
 *
 * Fails the moment any forbidden token re-appears in the scoped files.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

const SCOPED_FILES = [
    "app/(dashboard)/profile/page.tsx",
    "app/(dashboard)/profile/_components/profile-form.tsx",
    "app/(dashboard)/profile/_components/account-meta-card.tsx",
    "app/(dashboard)/workspace/page.tsx",
    "app/(dashboard)/workspace/new/page.tsx",
    "app/(dashboard)/workspace/new/new-workspace-form.tsx",
    "app/(dashboard)/workspace/[workspaceId]/page.tsx",
    "app/(dashboard)/workspace/[workspaceId]/_components/dismissible-banner.tsx",
    "app/(dashboard)/workspace/[workspaceId]/_components/workspace-banner-notifications.tsx",
    "app/(dashboard)/error.tsx",
] as const;

const FORBIDDEN_RAMPS = ["gray", "slate", "zinc", "neutral", "stone"] as const;

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

    const rampPattern = new RegExp(
        String.raw`\b(?:${COLOR_UTILITIES.join("|")})-(?:${FORBIDDEN_RAMPS.join("|")})-\d{2,3}(?:\/\d+)?\b`,
        "g",
    );
    hits.push(...(source.match(rampPattern) ?? []));

    const literalPattern = new RegExp(
        String.raw`\b(?:${COLOR_UTILITIES.join("|")})-(?:white|black)(?:\/\d+)?\b`,
        "g",
    );
    hits.push(...(source.match(literalPattern) ?? []));

    return hits;
}

describe("profile + workspace landing dark-audit", () => {
    for (const relativePath of SCOPED_FILES) {
        test(`${relativePath} uses only semantic theme tokens`, () => {
            const source = readFileSync(join(REPO_ROOT, relativePath), "utf8");
            const offenders = findForbidden(source);
            expect(offenders).toEqual([]);
        });
    }
});

describe("findForbidden regex anchoring", () => {
    test("catches real palette + literal offenders", () => {
        expect(findForbidden(`className="bg-slate-300"`)).toEqual(["bg-slate-300"]);
        expect(findForbidden(`className="dark:text-gray-500/40"`)).toEqual(["text-gray-500/40"]);
        expect(findForbidden(`className="bg-white"`)).toEqual(["bg-white"]);
    });

    test("ignores semantic tokens and unanchored bare words", () => {
        expect(findForbidden(`className="bg-muted text-foreground"`)).toEqual([]);
        expect(findForbidden(`// note: slate-300 is bad`)).toEqual([]);
        expect(findForbidden(`const slate300 = "neutral palette"`)).toEqual([]);
    });
});
