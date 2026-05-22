/**
 * Dark-audit regression lock for the spend dashboard.
 *
 * The spend route is the headline surface customers land on. Every Tailwind
 * class in the scoped files must come from the semantic token set defined in
 * `app/globals.css` (`bg-background`, `text-foreground`, `bg-muted`,
 * `border-warning`, ...) so a single CSS variable swap retints both modes.
 * Raw palette ramps (`gray-*`, `slate-*`, ...) and pure black/white pin a
 * luminance to one theme and break the other.
 *
 * This test fails the moment a forbidden token re-appears in the scoped
 * files. Run after touching the spend UI to catch regressions before review.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

const SCOPED_FILES = [
    "app/(dashboard)/workspace/[workspaceId]/spend/page.tsx",
    "app/(dashboard)/workspace/[workspaceId]/spend/_components/spend-chart.tsx",
    "components/ui/dashboard-views/top-spenders-table.tsx",
    "app/(dashboard)/workspace/[workspaceId]/spend/_components/empty-onboarding.tsx",
    "components/ui/workspace/dashboard-section.tsx",
    "components/ui/workspace/stat-tile.tsx",
    "components/ui/workspace/status-tag.tsx",
] as const;

// Raw Tailwind palette ramps that have no theme-aware counterpart.
const FORBIDDEN_RAMPS = [
    "gray",
    "slate",
    "zinc",
    "neutral",
    "stone",
    "yellow",
    "amber",
    "red",
    "orange",
    "green",
    "emerald",
    "blue",
    "indigo",
    "violet",
    "purple",
    "pink",
    "rose",
    "sky",
    "cyan",
    "teal",
    "lime",
    "fuchsia",
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

function findForbidden(source: string): string[] {
    const hits: string[] = [];

    // bg-yellow-50, dark:text-gray-500, border-zinc-700/40, ...
    const rampPattern = new RegExp(
        String.raw`\b(?:${COLOR_UTILITIES.join("|")})-(?:${FORBIDDEN_RAMPS.join("|")})-\d{2,3}(?:\/\d+)?\b`,
        "g",
    );
    hits.push(...(source.match(rampPattern) ?? []));

    // bg-white, text-black, border-white/10, ...
    const literalPattern = new RegExp(
        String.raw`\b(?:${COLOR_UTILITIES.join("|")})-(?:white|black)(?:\/\d+)?\b`,
        "g",
    );
    hits.push(...(source.match(literalPattern) ?? []));

    return hits;
}

describe("spend dashboard dark-audit", () => {
    for (const relativePath of SCOPED_FILES) {
        test(`${relativePath} uses only semantic theme tokens`, () => {
            const source = readFileSync(join(REPO_ROOT, relativePath), "utf8");
            const offenders = findForbidden(source);
            expect(offenders).toEqual([]);
        });
    }
});
