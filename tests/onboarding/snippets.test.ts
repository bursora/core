/**
 * Tests for the shared SDK-snippet templates. Both the spend empty-state and
 * the setup wizard consume `SNIPPET_TEMPLATES`; this asserts every supported
 * provider plus the Vercel AI SDK is present, in order, with sentinels intact —
 * distinct-shape snippets extracted from the real `sdk/examples/*-quickstart.ts`
 * files, OpenAI-compatible vendors generated from the shared template.
 */

import { SNIPPET_TEMPLATES } from "@/lib/onboarding/snippets";
import { describe, expect, test } from "bun:test";

const EXPECTED_IDS = [
    "openai",
    "anthropic",
    "google",
    "deepseek",
    "groq",
    "xai",
    "mistral",
    "together",
    "fireworks",
    "perplexity",
    "openrouter",
    "vercel",
    "ai-sdk",
];

describe("SNIPPET_TEMPLATES", () => {
    test("exposes every supported provider plus the Vercel AI SDK, in order", () => {
        expect(SNIPPET_TEMPLATES.map((t) => t.id)).toEqual(EXPECTED_IDS);
        expect(SNIPPET_TEMPLATES.at(-1)?.label).toBe("Vercel AI SDK");
    });

    test("each snippet carries code with unrendered sentinels and no leftover placeholders", () => {
        for (const t of SNIPPET_TEMPLATES) {
            expect(t.label.length).toBeGreaterThan(0);
            expect(t.code.length).toBeGreaterThan(0);
            expect(t.code).toContain('"__BURSORA_API_KEY__"');
            expect(t.code).toContain('"__BURSORA_WORKSPACE_ID__"');
            expect(t.code).not.toContain("{{");
        }
    });

    test("OpenAI-compatible snippets point at the vendor baseURL", () => {
        const codeFor = (id: string) => SNIPPET_TEMPLATES.find((t) => t.id === id)?.code ?? "";
        expect(codeFor("deepseek")).toContain("https://api.deepseek.com");
        expect(codeFor("groq")).toContain("api.groq.com");
        expect(codeFor("openrouter")).toContain("openrouter.ai");
    });
});
