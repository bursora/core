/**
 * Pure derivation of the dashboard "Getting started" widget's five rows from a
 * resolved activation state. Each row carries its label, whether it's done, the
 * link a todo row points at, and whether it shows the live first-event strip.
 *
 * Keeping this pure lets the widget JSX stay a thin map and lets the row logic
 * (labels, links, completion count) be unit-tested without rendering.
 */

import { buildWorkspacePath } from "@/lib/routes";
import type { Route } from "next";
import type { ActivationState } from "./activation-state";

export interface GettingStartedRow {
    readonly key: string;
    readonly label: string;
    readonly done: boolean;
    /** Where a todo row links. `null` for done rows (non-interactive) and the live row. */
    readonly href: Route | null;
    /** True only for the first-event row, which shows the live waiting strip while todo. */
    readonly live: boolean;
}

export interface GettingStartedRows {
    readonly rows: ReadonlyArray<GettingStartedRow>;
    readonly completed: number;
    readonly total: number;
}

export function buildGettingStartedRows(
    state: ActivationState,
    workspaceId: string,
): GettingStartedRows {
    const rows: ReadonlyArray<GettingStartedRow> = [
        {
            key: "workspace",
            label: "Workspace created",
            done: state.workspaceCreated,
            href: null,
            live: false,
        },
        {
            key: "api-key",
            label: "API key issued",
            done: state.apiKeyIssued,
            href: state.apiKeyIssued ? null : buildWorkspacePath(workspaceId, "keys"),
            live: false,
        },
        {
            key: "first-event",
            label: "Send your first event",
            done: state.firstEventSent,
            href: null,
            live: !state.firstEventSent,
        },
        {
            key: "budget",
            label: "Set a budget",
            done: state.budgetSet,
            href: state.budgetSet ? null : buildWorkspacePath(workspaceId, "budgets"),
            live: false,
        },
        {
            key: "teammate",
            label: "Invite a teammate",
            done: state.teammateInvited,
            href: state.teammateInvited ? null : buildWorkspacePath(workspaceId, "members"),
            live: false,
        },
    ];

    return {
        rows,
        completed: rows.filter((r) => r.done).length,
        total: rows.length,
    };
}
