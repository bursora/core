/**
 * Tests for <WorkspaceAvatar />: the square sibling of <UserAvatar />.
 *
 * Verifies the component reuses the shared `lib/avatar` helpers
 * (`avatarInitials`, `avatarPaletteClass`) so the monogram and palette
 * match what the rest of the chrome shows for the same workspace. Also
 * pins the square shape (`rounded-[6px]`) that the sidebar mockup
 * specifies — the only intentional visual divergence from the round
 * user avatar.
 *
 * Lives in a `.ts` file (no JSX) so it slots next to the existing pure
 * `user-avatar.test.ts`; we use `createElement` for the few render
 * assertions that need the component instantiated.
 */

import { WorkspaceAvatar } from "@/components/ui/workspace-avatar";
import { WORKSPACE_PALETTE, avatarInitials, avatarPaletteClass } from "@/lib/avatar";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const renderAvatar = (props: Parameters<typeof WorkspaceAvatar>[0]): string =>
    renderToStaticMarkup(createElement(WorkspaceAvatar, props));

describe("WorkspaceAvatar initials", () => {
    test("renders initials from name via the shared avatarInitials helper", () => {
        const html = renderAvatar({ name: "Acme Corp", workspaceId: "ws_1" });
        expect(html).toContain(`>${avatarInitials("Acme Corp")}<`);
    });

    test("falls back to ? when name has no letters", () => {
        const html = renderAvatar({ name: "  ", workspaceId: "ws_2" });
        expect(html).toContain(">?<");
    });

    test("uses two letters of a single-token name", () => {
        const html = renderAvatar({ name: "acme", workspaceId: "ws_3" });
        expect(html).toContain(">AC<");
    });
});

describe("WorkspaceAvatar palette", () => {
    test("picks the workspace-palette class for the given workspaceId", () => {
        const id = "ws_palette_check";
        const expected = avatarPaletteClass(id, "workspace");
        const firstToken = expected.split(" ")[0] ?? "";
        const html = renderAvatar({ name: "Acme", workspaceId: id });
        expect(WORKSPACE_PALETTE).toContain(expected);
        expect(firstToken.length).toBeGreaterThan(0);
        expect(html).toContain(firstToken);
    });

    test("same workspaceId always renders the same palette token", () => {
        const firstToken = avatarPaletteClass("ws_stable", "workspace").split(" ")[0] ?? "";
        const a = renderAvatar({ name: "Acme", workspaceId: "ws_stable" });
        const b = renderAvatar({ name: "Different Name", workspaceId: "ws_stable" });
        expect(a).toContain(firstToken);
        expect(b).toContain(firstToken);
    });

    test("different workspaceIds usually render different palette tokens", () => {
        const ids = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
        const tokens = new Set(
            ids.map((id) => avatarPaletteClass(id, "workspace").split(" ")[0] ?? ""),
        );
        expect(tokens.size).toBeGreaterThan(1);

        const rendered = ids.map((id) => renderAvatar({ name: "x", workspaceId: id }));
        const seen = new Set(
            rendered.flatMap((html) =>
                Array.from(tokens).filter((token) => token !== "" && html.includes(token)),
            ),
        );
        expect(seen.size).toBeGreaterThan(1);
    });
});

describe("WorkspaceAvatar shape", () => {
    test("renders with the square rounded-[6px] class, not rounded-full", () => {
        const html = renderAvatar({ name: "Acme", workspaceId: "ws_shape" });
        expect(html).toContain("rounded-[6px]");
        expect(html).not.toContain("rounded-full");
    });

    test("exposes role=img and aria-label=name for screen readers", () => {
        const html = renderAvatar({ name: "Acme Corp", workspaceId: "ws_aria" });
        expect(html).toContain('role="img"');
        expect(html).toContain('aria-label="Acme Corp"');
    });

    test("applies the requested size token class", () => {
        const html = renderAvatar({ name: "Acme", workspaceId: "ws_size", size: "xs" });
        expect(html).toContain("h-5");
        expect(html).toContain("w-5");
    });

    test("merges caller className with the base classes", () => {
        const html = renderAvatar({
            name: "Acme",
            workspaceId: "ws_class",
            className: "ring-1",
        });
        expect(html).toContain("ring-1");
    });
});
