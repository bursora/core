/**
 * Tests for the inline-style ban in app/ and components/ (excluding components/ui/).
 *
 * shadcn-generated UI primitives in components/ui/** legitimately use inline
 * style for things like CSS-variable-driven sizing; everything else must use
 * Tailwind utilities.
 */

import { describe, expect, test } from "bun:test";
import { ESLint } from "eslint";
// @ts-expect-error - flat config is plain JS without types
import config from "@/eslint.config.js";

// Strip the projectService block so synthetic test paths (which don't exist
// on disk) don't trigger "file not found by project service". The
// `react/forbid-dom-props` rule under test does not need type info.
const isProjectServiceBlock = (block: unknown): boolean => {
    if (typeof block !== "object" || block === null) return false;
    const lang = (block as { languageOptions?: { parserOptions?: { projectService?: unknown } } })
        .languageOptions;
    return lang?.parserOptions?.projectService === true;
};

const overrideConfig = (config as unknown[]).filter(
    (block) => !isProjectServiceBlock(block),
) as ESLint.Options["overrideConfig"];

const lint = (filePath: string, code: string) => {
    const eslint = new ESLint({
        overrideConfigFile: true,
        overrideConfig,
    });
    return eslint.lintText(code, { filePath });
};

const inlineStyleMessages = (messages: ESLint.LintResult["messages"]) =>
    messages.filter((m) => m.ruleId === "react/forbid-dom-props");

describe("no inline styles in app/ and components/", () => {
    test("flags style={{...}} in app/ files", async () => {
        const code = `
      export default function Page() {
        return <div style={{ color: "red" }}>x</div>;
      }
    `;
        const [result] = await lint("app/some-page.tsx", code);
        expect(inlineStyleMessages(result!.messages).length).toBeGreaterThan(0);
    });

    test("flags style={{...}} in components/ files outside ui/", async () => {
        const code = `
      export function Thing() {
        return <span style={{ background: "blue" }} />;
      }
    `;
        const [result] = await lint("components/thing.tsx", code);
        expect(inlineStyleMessages(result!.messages).length).toBeGreaterThan(0);
    });

    test("allows style={{...}} inside components/ui/ (shadcn)", async () => {
        const code = `
      export function UiPrim() {
        return <span style={{ width: "var(--w)" }} />;
      }
    `;
        const [result] = await lint("components/ui/prim.tsx", code);
        expect(inlineStyleMessages(result!.messages).length).toBe(0);
    });
});
