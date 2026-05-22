/**
 * Tests for `extractRegion` in `lib/extract-snippet.ts`.
 *
 * The helper reads an example file and returns the lines between
 * `// region:<id>` and `// endregion`, with the markers stripped and any
 * leading/trailing blank lines trimmed. Internal indentation is preserved.
 *
 * Used by both the doc build path and the doc-vs-code drift test, so the
 * contract has to be precise.
 */

import { extractRegion, RegionNotFoundError } from "@/lib/extract-snippet";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const writeTmp = (contents: string): { path: string; cleanup: () => void } => {
    const dir = mkdtempSync(join(tmpdir(), "bursora-extract-"));
    const path = join(dir, "example.ts");
    writeFileSync(path, contents, "utf8");
    return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};

describe("extractRegion", () => {
    test("returns the lines between matching region markers, markers stripped", () => {
        const file = writeTmp(
            [
                "import { wrap } from '@bursora/sdk';",
                "",
                "// region:openai-quickstart",
                "const openai = wrap({} as never, core);",
                "// endregion",
                "",
            ].join("\n"),
        );

        try {
            expect(extractRegion(file.path, "openai-quickstart")).toBe(
                "const openai = wrap({} as never, core);",
            );
        } finally {
            file.cleanup();
        }
    });

    test("throws RegionNotFoundError with the file + region id when the marker is missing", () => {
        const file = writeTmp("// some unrelated content\n");

        let caught: unknown = null;
        try {
            extractRegion(file.path, "openai-quickstart");
        } catch (err) {
            caught = err;
        } finally {
            file.cleanup();
        }

        expect(caught).toBeInstanceOf(RegionNotFoundError);
        const message = (caught as Error).message;
        expect(message).toContain("openai-quickstart");
        expect(message).toContain(file.path);
    });

    test("preserves leading whitespace inside the region (multiline body, indented)", () => {
        const file = writeTmp(
            [
                "// region:nested",
                "await withTags({ tenant_id: 'acme' }, async () => {",
                "  await withTags({ agent_id: 'support' }, async () => {",
                "    await openai.chat.completions.create({ model: 'gpt-4o-mini' });",
                "  });",
                "});",
                "// endregion",
            ].join("\n"),
        );

        try {
            const out = extractRegion(file.path, "nested");
            expect(out).toBe(
                [
                    "await withTags({ tenant_id: 'acme' }, async () => {",
                    "  await withTags({ agent_id: 'support' }, async () => {",
                    "    await openai.chat.completions.create({ model: 'gpt-4o-mini' });",
                    "  });",
                    "});",
                ].join("\n"),
            );
        } finally {
            file.cleanup();
        }
    });

    test("trims surrounding blank lines but keeps internal blank lines", () => {
        const file = writeTmp(
            ["// region:demo", "", "const a = 1;", "", "const b = 2;", "", "// endregion"].join(
                "\n",
            ),
        );

        try {
            const out = extractRegion(file.path, "demo");
            expect(out).toBe(["const a = 1;", "", "const b = 2;"].join("\n"));
        } finally {
            file.cleanup();
        }
    });

    test("throws RegionNotFoundError when only the start marker is found (no endregion)", () => {
        const file = writeTmp(["// region:dangling", "const x = 1;", ""].join("\n"));

        let caught: unknown = null;
        try {
            extractRegion(file.path, "dangling");
        } catch (err) {
            caught = err;
        } finally {
            file.cleanup();
        }

        expect(caught).toBeInstanceOf(RegionNotFoundError);
        expect((caught as Error).message).toContain("endregion");
    });

    test("matches by region id, ignoring other regions in the file", () => {
        const file = writeTmp(
            [
                "// region:first",
                "const first = 1;",
                "// endregion",
                "",
                "// region:second",
                "const second = 2;",
                "// endregion",
            ].join("\n"),
        );

        try {
            expect(extractRegion(file.path, "second")).toBe("const second = 2;");
            expect(extractRegion(file.path, "first")).toBe("const first = 1;");
        } finally {
            file.cleanup();
        }
    });
});
