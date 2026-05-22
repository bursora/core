"use client";

/**
 * Reads the user's `prefers-reduced-motion` media query. Returns `false` on
 * the server and on first client paint to avoid hydration mismatches; flips
 * to `true` after mount when the user has the preference enabled.
 */

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void): () => void {
    const mql = window.matchMedia(QUERY);
    mql.addEventListener("change", callback);
    return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
    return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
    return false;
}

export function useReducedMotion(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
