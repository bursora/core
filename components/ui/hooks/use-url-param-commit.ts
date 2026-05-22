"use client";

/**
 * Commit URL search-param changes through the Next router with a transition.
 *
 * Filter components (faceted pill, date range, clear-all) all share the same
 * shape: read the current query string, set or delete some keys, push the
 * result back via `router.replace`. This hook centralises that logic so the
 * components stay focused on what they show, not how routing works.
 */

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export interface UrlParamCommit {
    readonly set?: Record<string, string>;
    readonly delete?: readonly string[];
}

export interface UrlParamCommitController {
    readonly commit: (change: UrlParamCommit) => void;
    readonly isPending: boolean;
}

export function useUrlParamCommit(): UrlParamCommitController {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const commit = (change: UrlParamCommit): void => {
        const params = new URLSearchParams(searchParams.toString());
        for (const k of change.delete ?? []) params.delete(k);
        for (const [k, v] of Object.entries(change.set ?? {})) params.set(k, v);
        const qs = params.toString();
        const target = qs.length > 0 ? `${pathname}?${qs}` : pathname;
        startTransition(() => router.replace(target as Route));
    };

    return { commit, isPending };
}
