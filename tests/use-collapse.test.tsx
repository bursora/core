/**
 * `useCollapse` collapse state machine extracted from the sidebar so the
 * open/close behavior can be tested in isolation, without the rest of the
 * sidebar layout, keyboard, and animation surface.
 *
 * The hook returns `{ open, toggle, set }`. Persistence is opt-in through
 * `persistKey`; when provided the hook mirrors the current open state to a
 * cookie so the user's choice survives reloads. Matches the shadcn baseline
 * behavior the sidebar already shipped with.
 *
 * Tests run under `bun:test` without a DOM. The hook itself is exercised via
 * a probe component rendered with `renderToString` (initial render only).
 * Toggle, set, and persistence semantics are covered through the pure
 * helpers the hook composes with, same pattern as `optimisticReducer`.
 */

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import {
    readPersistedOpen,
    serializeCookie,
    useCollapse,
} from "@/components/ui/hooks/use-collapse";

function Probe({ defaultOpen }: { readonly defaultOpen?: boolean }): string {
    const { open } = useCollapse(defaultOpen === undefined ? undefined : { defaultOpen });
    return open ? "OPEN" : "CLOSED";
}

describe("useCollapse: initial state", () => {
    test("defaults to open when no options are provided", () => {
        const html = renderToString(createElement(Probe, {}));
        expect(html).toContain("OPEN");
    });

    test("respects defaultOpen=false", () => {
        const html = renderToString(createElement(Probe, { defaultOpen: false }));
        expect(html).toContain("CLOSED");
    });

    test("returns the documented shape: open + toggle + set", () => {
        function ShapeProbe(): string {
            const state = useCollapse();
            return `${typeof state.open}|${typeof state.toggle}|${typeof state.set}`;
        }
        const html = renderToString(createElement(ShapeProbe));
        expect(html).toContain("boolean|function|function");
    });
});

describe("serializeCookie", () => {
    test("writes the key=value pair with the path attribute", () => {
        const cookie = serializeCookie("sidebar_state", true);
        expect(cookie).toMatch(/^sidebar_state=true;/);
        expect(cookie).toContain("path=/");
    });

    test("encodes the boolean as a literal", () => {
        expect(serializeCookie("k", false)).toContain("k=false");
    });

    test("attaches a max-age so the choice survives reloads", () => {
        expect(serializeCookie("k", true)).toMatch(/max-age=\d+/);
    });
});

describe("readPersistedOpen", () => {
    test("returns null when the cookie jar is empty", () => {
        expect(readPersistedOpen("", "sidebar_state")).toBeNull();
    });

    test("returns null when the key is not present", () => {
        expect(readPersistedOpen("other=1; foo=bar", "sidebar_state")).toBeNull();
    });

    test("returns true when the cookie value is the literal 'true'", () => {
        expect(readPersistedOpen("sidebar_state=true", "sidebar_state")).toBe(true);
        expect(readPersistedOpen("a=1; sidebar_state=true; b=2", "sidebar_state")).toBe(true);
    });

    test("returns false when the cookie value is the literal 'false'", () => {
        expect(readPersistedOpen("sidebar_state=false", "sidebar_state")).toBe(false);
    });

    test("ignores keys that share a suffix with the target", () => {
        expect(readPersistedOpen("xsidebar_state=true", "sidebar_state")).toBeNull();
    });
});

describe("persistKey round-trip", () => {
    test("a value written by serializeCookie is recovered by readPersistedOpen", () => {
        const cookieString = serializeCookie("collapse_k", false).split(";")[0] ?? "";
        expect(readPersistedOpen(cookieString, "collapse_k")).toBe(false);
    });

    test("the round-trip preserves true", () => {
        const cookieString = serializeCookie("collapse_k", true).split(";")[0] ?? "";
        expect(readPersistedOpen(cookieString, "collapse_k")).toBe(true);
    });
});

describe("useCollapse with persistKey on the server", () => {
    test("falls back to defaultOpen when no document is available", () => {
        function ServerProbe(): string {
            const { open } = useCollapse({ defaultOpen: false, persistKey: "x" });
            return open ? "OPEN" : "CLOSED";
        }
        const html = renderToString(createElement(ServerProbe));
        expect(html).toContain("CLOSED");
    });
});
