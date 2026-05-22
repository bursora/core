/**
 * Tests for the dashboard sidebar header (the row that mirrors the landing
 * mockup: square workspace avatar on the left, workspace name + a
 * monospaced environment sub-line, then a chevron button on the right
 * that opens the workspace switcher popover).
 *
 * `WorkspaceHeader` is rendered via static markup; the chevron trigger
 * (the only interactive bit) lives in `WorkspaceSwitcher` and is asserted
 * for presence + accessible name only. The popover body itself is a
 * client-only Radix portal we don't exercise here — it's covered by the
 * switcher's own behavior and the shell-chrome dark-audit lock.
 */

import { beforeAll, describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

beforeAll(() => {
    mock.module("next/navigation", () => ({
        useRouter: () => ({ push: () => undefined, replace: () => undefined }),
        usePathname: () => "/",
    }));
});

const baseWorkspace = {
    id: "ws_acme",
    name: "acme-corp",
    environment: "prod",
};

interface HeaderProps {
    workspaces: ReadonlyArray<{
        readonly id: string;
        readonly name: string;
        readonly environment: string;
    }>;
    activeWorkspace: {
        readonly id: string;
        readonly name: string;
        readonly environment: string;
    } | null;
    activeWorkspaceId: string | null;
}

async function render(props: HeaderProps): Promise<string> {
    const { WorkspaceHeader } = await import("@/components/shell/workspace-header");
    return renderToStaticMarkup(createElement(WorkspaceHeader, props));
}

describe("WorkspaceHeader: active workspace", () => {
    test("renders the workspace name as the primary label", async () => {
        const html = await render({
            workspaces: [baseWorkspace],
            activeWorkspace: baseWorkspace,
            activeWorkspaceId: baseWorkspace.id,
        });
        expect(html).toContain("acme-corp");
    });

    test("renders the square workspace avatar (rounded-[6px], not rounded-full)", async () => {
        const html = await render({
            workspaces: [baseWorkspace],
            activeWorkspace: baseWorkspace,
            activeWorkspaceId: baseWorkspace.id,
        });
        const avatarSpan = html.match(/<span[^>]*aria-label="acme-corp"[^>]*>/)?.[0] ?? "";
        expect(avatarSpan).toContain("rounded-[6px]");
        expect(avatarSpan).not.toContain("rounded-full");
        expect(avatarSpan).toContain('role="img"');
    });

    test("renders the environment label in a monospaced muted sub-line", async () => {
        const html = await render({
            workspaces: [baseWorkspace],
            activeWorkspace: baseWorkspace,
            activeWorkspaceId: baseWorkspace.id,
        });
        expect(html).toContain("prod");
        expect(html).toContain("font-mono");
        expect(html).toContain("text-muted-foreground");
    });

    test("renders the chevron trigger with the workspace switcher accessible label", async () => {
        const html = await render({
            workspaces: [baseWorkspace],
            activeWorkspace: baseWorkspace,
            activeWorkspaceId: baseWorkspace.id,
        });
        expect(html).toContain('aria-label="Switch workspace"');
    });

    test("renders exactly one switcher trigger button", async () => {
        const html = await render({
            workspaces: [baseWorkspace],
            activeWorkspace: baseWorkspace,
            activeWorkspaceId: baseWorkspace.id,
        });
        const matches = html.match(/aria-label="Switch workspace"/g) ?? [];
        expect(matches.length).toBe(1);
    });
});

describe("WorkspaceHeader: no active workspace", () => {
    test("renders the switcher trigger but no avatar / environment", async () => {
        const html = await render({
            workspaces: [],
            activeWorkspace: null,
            activeWorkspaceId: null,
        });
        expect(html).toContain('aria-label="Switch workspace"');
        expect(html).not.toContain('role="img"');
    });
});
