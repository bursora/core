/**
 * Theme baseline. Verifies the no-flash wiring users rely on:
 *
 * - The local `ThemeProvider` wrapper turns on `disableTransitionOnChange`
 *   by default, killing the transition flicker when toggling.
 * - Caller props (attribute, defaultTheme, enableSystem) propagate to
 *   the underlying next-themes provider.
 * - The root layout marks `<html>` with `suppressHydrationWarning`, the
 *   prerequisite for next-themes' inline script to swap the class before
 *   first paint without React tripping on the mismatch.
 * - The root layout wires the theme provider with the expected baseline
 *   props (`attribute="class"`, `defaultTheme="system"`, `enableSystem`).
 */

import { describe, expect, mock, test } from "bun:test";
import { isValidElement, type ReactElement } from "react";

// next/font/google is a bundler hook in Next; in plain Bun tests it has
// no font exports. Register stubs for every face the layout pulls in.
mock.module("next/font/google", () => ({
    Space_Grotesk: () => ({ variable: "--font-space-grotesk", className: "font-space-grotesk" }),
    Geist_Mono: () => ({ variable: "--font-geist-mono", className: "font-geist-mono" }),
}));

// The root layout reads the `tz` cookie server-side via `getRequestTimeZone`.
// No cookie in tests → it falls back to UTC.
mock.module("next/headers", () => ({
    cookies: async () => ({ get: () => undefined }),
}));

const { ThemeProvider } = await import("@/components/ui/shell/theme-provider");
const { default: RootLayout } = await import("@/app/layout");

type AnyProps = Record<string, unknown>;

function isElement(value: unknown): value is ReactElement<AnyProps> {
    return isValidElement(value);
}

function findElementByDisplayName(
    node: unknown,
    displayName: string,
): ReactElement<AnyProps> | null {
    if (!isElement(node)) return null;
    const type = node.type as { displayName?: string; name?: string } | string;
    if (typeof type !== "string") {
        if (type.displayName === displayName || type.name === displayName) {
            return node;
        }
    }
    const children = (node.props as AnyProps).children;
    if (Array.isArray(children)) {
        for (const child of children) {
            const found = findElementByDisplayName(child, displayName);
            if (found) return found;
        }
        return null;
    }
    return findElementByDisplayName(children, displayName);
}

describe("ThemeProvider wrapper", () => {
    test("turns on disableTransitionOnChange by default", () => {
        const tree = ThemeProvider({ children: null });
        expect(isElement(tree)).toBe(true);
        const props = (tree as ReactElement<AnyProps>).props;
        expect(props.disableTransitionOnChange).toBe(true);
    });

    test("forwards caller props (attribute, defaultTheme, enableSystem)", () => {
        const tree = ThemeProvider({
            children: null,
            attribute: "class",
            defaultTheme: "system",
            enableSystem: true,
        });
        const props = (tree as ReactElement<AnyProps>).props;
        expect(props.attribute).toBe("class");
        expect(props.defaultTheme).toBe("system");
        expect(props.enableSystem).toBe(true);
    });
});

describe("RootLayout", () => {
    test("renders <html> with suppressHydrationWarning so next-themes can swap the class pre-paint", async () => {
        const tree = await RootLayout({ children: null });
        expect(isElement(tree)).toBe(true);
        expect((tree as ReactElement<AnyProps>).type).toBe("html");
        expect((tree as ReactElement<AnyProps>).props.suppressHydrationWarning).toBe(true);
    });

    test("mounts ThemeProvider with attribute=class, defaultTheme=system, enableSystem", async () => {
        const tree = await RootLayout({ children: null });
        const themeProvider = findElementByDisplayName(tree, "ThemeProvider");
        expect(themeProvider).not.toBeNull();
        const props = themeProvider!.props;
        expect(props.attribute).toBe("class");
        expect(props.defaultTheme).toBe("system");
        expect(props.enableSystem).toBe(true);
    });
});
