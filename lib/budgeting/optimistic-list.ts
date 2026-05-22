/**
 * Pure reducer helpers for `useOptimistic` lists used in dashboards.
 *
 * Each item in the list carries a `pending` discriminator:
 *   - `none`     — confirmed by the server.
 *   - `creating` — locally created, waiting on server confirmation.
 *   - `updating` — locally patched, waiting on server confirmation.
 *   - `removing` — locally marked for deletion, waiting on confirmation.
 *
 * The components apply visual treatment (reduced opacity) based on this
 * flag. On rollback, creating rows are dropped and removing rows are
 * un-dimmed. Keeping this logic in a pure function lets the optimistic
 * behavior stay testable without a DOM.
 */

export type PendingState = "none" | "creating" | "updating" | "removing";

export interface OptimisticItem {
    readonly id: string;
    readonly pending: PendingState;
}

export type OptimisticAction<T extends OptimisticItem> =
    | { readonly kind: "add"; readonly item: T }
    | { readonly kind: "update"; readonly id: string; readonly patch: Partial<T> }
    | { readonly kind: "remove"; readonly id: string }
    | { readonly kind: "rollback-add"; readonly id: string }
    | { readonly kind: "rollback-remove"; readonly id: string };

export function optimisticReducer<T extends OptimisticItem>(
    state: readonly T[],
    action: OptimisticAction<T>,
): readonly T[] {
    switch (action.kind) {
        case "add":
            return [...state, { ...action.item, pending: "creating" }];
        case "update":
            return state.map((row) =>
                row.id === action.id ? { ...row, ...action.patch, pending: "updating" } : row,
            );
        case "remove":
            return state.map((row) =>
                row.id === action.id ? { ...row, pending: "removing" } : row,
            );
        case "rollback-add":
            return state.filter((row) => row.id !== action.id);
        case "rollback-remove":
            return state.map((row) => (row.id === action.id ? { ...row, pending: "none" } : row));
    }
}

/**
 * Tailwind class list for an optimistic row. Returns reduced opacity
 * while a row is pending and an empty string otherwise so it can be
 * concatenated unconditionally.
 */
export function pendingRowClass(pending: PendingState): string {
    return pending === "none" ? "" : "opacity-50";
}
