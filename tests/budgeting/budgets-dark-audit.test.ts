/**
 * Dark-mode audit guard for the budgets surface.
 *
 * The budgets list, row affordances, headroom panel, form, edit dialog, and
 * label color helpers must render in both themes via semantic tokens. This
 * test pins two contracts:
 *
 * 1. None of the in-scope files contain raw palette tokens
 *    (`gray-*`, `slate-*`, `zinc-*`, `neutral-*`, `stone-*`, `bg-white`,
 *    `text-white`, `bg-black`, `text-black`).
 * 2. Mode color helpers in `labels.ts` map to semantic StatusTag tones so
 *    Tailwind v4 handles theme inversion at the token layer.
 */

import type { StatusTagTone } from "@/components/ui/workspace/status-tag";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");

const SCOPED_FILES: readonly string[] = [
    "app/(dashboard)/workspace/[workspaceId]/budgets/page.tsx",
    "app/(dashboard)/workspace/[workspaceId]/budgets/_components/budgets-list.tsx",
    "app/(dashboard)/workspace/[workspaceId]/budgets/_components/budget-row.tsx",
    "app/(dashboard)/workspace/[workspaceId]/budgets/_components/budget-create-button.tsx",
    "app/(dashboard)/workspace/[workspaceId]/budgets/_components/budget-form.tsx",
    "app/(dashboard)/workspace/[workspaceId]/budgets/_components/edit-budget-dialog.tsx",
    "app/(dashboard)/workspace/[workspaceId]/budgets/_components/labels.ts",
];

const FORBIDDEN_RE =
    /\b(?:gray|slate|zinc|neutral|stone)-\d+\b|\b(?:bg|text|border|ring|fill|stroke|placeholder|caret|decoration|divide|outline|accent|shadow|from|to|via)-(?:white|black)\b/;

const VALID_TONES: ReadonlySet<StatusTagTone> = new Set([
    "destructive",
    "warning",
    "success",
    "muted",
    "foreground",
    "info",
]);

const readScoped = (relPath: string): string => readFileSync(join(REPO_ROOT, relPath), "utf8");

describe("budgets surface dark audit", () => {
    for (const relPath of SCOPED_FILES) {
        test(`${relPath} has no raw palette tokens`, () => {
            const source = readScoped(relPath);
            const offenders: string[] = [];
            source.split(/\r?\n/).forEach((line, idx) => {
                const match = FORBIDDEN_RE.exec(line);
                if (match) offenders.push(`${idx + 1}: ${match[0]}`);
            });
            expect(offenders).toEqual([]);
        });
    }

    test("MODE_META status colors map to valid semantic StatusTag tones", async () => {
        const labels =
            await import("@/app/(dashboard)/workspace/[workspaceId]/budgets/_components/labels");
        for (const mode of ["notify", "throttle", "block"] as const) {
            const tone = labels.MODE_META[mode].tone;
            expect(VALID_TONES.has(tone), `${mode} tone "${tone}" not in StatusTagTone`).toBe(true);
        }
        expect(labels.MODE_META.throttle.tone).toBe("warning");
        expect(labels.MODE_META.block.tone).toBe("destructive");
    });
});
