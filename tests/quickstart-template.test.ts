/**
 * Tests for `renderSnippet` in `app/(dashboard)/workspace/[workspaceId]/spend/_lib/quickstart-template.ts`.
 *
 * Replaces sentinels `"__BURSORA_API_KEY__"`, `"__BURSORA_WORKSPACE_ID__"`, and
 * `"__BURSORA_ENDPOINT__"` inside an example template, throws when a sentinel
 * survives substitution (typo guard) and when any var is empty.
 */

import { renderSnippet } from "@/app/(dashboard)/workspace/[workspaceId]/spend/_lib/quickstart-template";
import { describe, expect, test } from "bun:test";

const VARS = { apiKey: "ak_123", workspaceId: "ws_42", endpoint: "https://app.bursora.com" };

describe("renderSnippet", () => {
    test("replaces all sentinels including multiple occurrences", () => {
        const tpl = [
            `apiKey: "__BURSORA_API_KEY__",`,
            `// workspace: "__BURSORA_WORKSPACE_ID__"`,
            `endpoint: "__BURSORA_ENDPOINT__"`,
            `tag: "__BURSORA_API_KEY__"`,
        ].join("\n");

        const out = renderSnippet(tpl, VARS);

        expect(out).toBe(
            [
                `apiKey: "ak_123",`,
                `// workspace: "ws_42"`,
                `endpoint: "https://app.bursora.com"`,
                `tag: "ak_123"`,
            ].join("\n"),
        );
    });

    test("is idempotent on rendered output", () => {
        const tpl = `key="__BURSORA_API_KEY__" ws="__BURSORA_WORKSPACE_ID__" url="__BURSORA_ENDPOINT__"`;
        const once = renderSnippet(tpl, VARS);
        const twice = renderSnippet(once, VARS);
        expect(twice).toBe(once);
    });

    test("throws when an api-key sentinel typo survives substitution", () => {
        const tpl = `apiKey: "__BURSORA_API_KEYS__"`;
        expect(() => renderSnippet(tpl, VARS)).toThrow();
    });

    test("throws when a workspace sentinel typo survives substitution", () => {
        const tpl = `ws: "__BURSORA_WORKSPACE__"`;
        expect(() => renderSnippet(tpl, VARS)).toThrow();
    });

    test("throws when an endpoint sentinel typo survives substitution", () => {
        const tpl = `url: "__BURSORA_ENDPOINTS__"`;
        expect(() => renderSnippet(tpl, VARS)).toThrow();
    });

    test("throws when apiKey is empty", () => {
        expect(() => renderSnippet(`x="__BURSORA_API_KEY__"`, { ...VARS, apiKey: "" })).toThrow();
    });

    test("throws when workspaceId is empty", () => {
        expect(() =>
            renderSnippet(`x="__BURSORA_WORKSPACE_ID__"`, { ...VARS, workspaceId: "" }),
        ).toThrow();
    });

    test("throws when endpoint is empty", () => {
        expect(() =>
            renderSnippet(`x="__BURSORA_ENDPOINT__"`, { ...VARS, endpoint: "" }),
        ).toThrow();
    });
});
