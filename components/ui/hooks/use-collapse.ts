"use client";

/**
 * Collapse state machine extracted from the sidebar.
 *
 * Returns `{ open, toggle, set }`. Persistence is opt-in: pass `persistKey`
 * to mirror the boolean to a cookie of that name so the choice survives
 * reloads. Matches the shadcn baseline cookie format the sidebar shipped
 * with (`<key>=<true|false>; path=/; max-age=<one week>`).
 */

import { useCallback, useState } from "react";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export interface UseCollapseOptions {
    readonly defaultOpen?: boolean;
    readonly persistKey?: string;
}

export interface CollapseState {
    readonly open: boolean;
    readonly toggle: () => void;
    readonly set: (next: boolean) => void;
}

export function serializeCookie(key: string, open: boolean): string {
    return `${key}=${open}; path=/; max-age=${COOKIE_MAX_AGE}`;
}

export function readPersistedOpen(cookieJar: string, key: string): boolean | null {
    for (const pair of cookieJar.split(";")) {
        const trimmed = pair.trim();
        if (!trimmed.startsWith(`${key}=`)) continue;
        const value = trimmed.slice(key.length + 1);
        if (value === "true") return true;
        if (value === "false") return false;
        return null;
    }
    return null;
}

export function useCollapse(opts?: UseCollapseOptions): CollapseState {
    const defaultOpen = opts?.defaultOpen ?? true;
    const persistKey = opts?.persistKey;
    const [open, setOpenState] = useState<boolean>(defaultOpen);

    const persist = useCallback(
        (next: boolean) => {
            if (!persistKey) return;
            if (typeof document === "undefined") return;
            document.cookie = serializeCookie(persistKey, next);
        },
        [persistKey],
    );

    const set = useCallback(
        (next: boolean) => {
            setOpenState(next);
            persist(next);
        },
        [persist],
    );
    const toggle = useCallback(() => {
        setOpenState((prev) => {
            const next = !prev;
            persist(next);
            return next;
        });
    }, [persist]);

    return { open, toggle, set };
}
