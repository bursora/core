/**
 * Pure helpers for the dashboard AppShell. Kept framework-free so they can be
 * unit-tested without a React renderer.
 *
 * URL builders live in `@/lib/routes` so server-side modules (billing,
 * detection) don't reach into `components/`.
 */

import { extractWorkspaceIdFromPath } from "@/lib/routes";

export interface WorkspaceOption {
    readonly id: string;
    readonly name: string;
    readonly environment: string;
}

export const WORKSPACE_COOKIE = "bursora_workspace";
export const WORKSPACE_COOKIE_MAX_AGE_SECONDS = 31_536_000;

/**
 * Writes the active workspace cookie from a client component.
 */
export function setWorkspaceCookie(workspaceId: string): void {
    document.cookie = `${WORKSPACE_COOKIE}=${workspaceId}; path=/; max-age=${WORKSPACE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

/**
 * Resolves which workspace should be considered active. URL takes precedence
 * over the cookie; both are validated against the user's actual memberships
 * so a stale cookie or hand-edited URL can't pick a workspace the user no
 * longer belongs to. Falls back to the first available workspace.
 */
export function resolveActiveWorkspaceId(input: {
    fromUrl: string | undefined;
    fromCookie: string | undefined;
    available: ReadonlyArray<{ readonly id: string }>;
}): string | null {
    const ids = new Set(input.available.map((w) => w.id));
    if (input.fromUrl && ids.has(input.fromUrl)) return input.fromUrl;
    if (input.fromCookie && ids.has(input.fromCookie)) return input.fromCookie;
    return input.available[0]?.id ?? null;
}

/**
 * Active-state matcher for sidebar links. The workspace root
 * (`/workspace/<id>`) must match exactly so nested routes like
 * `/workspace/<id>/settings` don't also light up Dashboard; everything else
 * uses prefix match so `/workspace/<id>/spend/tx-123` highlights Spend.
 */
export function isActiveLink(pathname: string, href: string): boolean {
    const wsId = extractWorkspaceIdFromPath(href);
    if (wsId !== null && href === `/workspace/${wsId}`) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
}
