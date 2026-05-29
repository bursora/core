/**
 * Workspace URL builders.
 *
 * Pure, framework-free helpers for composing canonical workspace paths.
 * Live in `lib/` so server-side modules (`lib/billing`, `lib/detection`,
 * server actions) can import them without reaching into `components/`.
 */

import type { Route } from "next";

/**
 * `?from=` value set on the keys-page link rendered in the spend empty state.
 * The keys page reads it to auto-open the issue-key dialog, then strips it so
 * a refresh or back-navigation doesn't reopen the dialog.
 */
export const KEYS_FROM_SPEND_EMPTY = "spend-empty";

/**
 * Canonical workspace page URL. Section omitted ⇒ workspace home.
 *
 * `query` is appended as `?k=v&...` (URL-encoded). Falsy/empty query ⇒
 * unchanged path. Callers should prefer this over hand-rolled string
 * concatenation + `as Route` so typed-routes keeps its invariants.
 */
export function buildWorkspacePath(
    workspaceId: string,
    section?: string,
    query?: Record<string, string>,
): Route {
    const base = `/workspace/${encodeURIComponent(workspaceId)}`;
    const path = section ? `${base}/${section}` : base;
    if (!query) return path as Route;
    const qs = new URLSearchParams(query).toString();
    return (qs.length === 0 ? path : `${path}?${qs}`) as Route;
}

/**
 * Extracts the workspace id from a pathname like `/workspace/ws-a/...`.
 * Returns null when the path isn't workspace-scoped.
 */
export function extractWorkspaceIdFromPath(pathname: string): string | null {
    const match = pathname.match(/^\/workspace\/([^/]+)/);
    return match?.[1] ?? null;
}

/**
 * Builds the destination URL when the user picks a different workspace from
 * the switcher. Maps the current path's workspace segment to the new id,
 * preserving the section (e.g. `/workspace/A/spend` → `/workspace/B/spend`).
 * Falls back to the new workspace home for paths that aren't workspace-scoped.
 */
export function buildWorkspaceSwitchUrl(pathname: string, workspaceId: string): string {
    const match = pathname.match(/^\/workspace\/[^/]+(\/.*)?$/);
    const suffix = match?.[1] ?? "";
    return `${buildWorkspacePath(workspaceId)}${suffix}`;
}
