"use client";

/**
 * SPA pageview tracker. App Router client navigations don't emit `$pageview` on
 * their own (only hard loads do), so we capture one manually whenever the path
 * or query changes. `capture_pageview` is off in the provider to avoid a double
 * fire on the initial load. Pageleave is handled by `capture_pageleave` in the
 * provider init.
 *
 * The client comes from `usePostHog()` and is a dep of the capture effect: this
 * component's effect runs before the provider's init effect on first mount, so
 * reading the singleton directly would drop the entry-page `$pageview`. Keying
 * off the context client re-runs the effect once the client is ready, firing
 * the initial pageview exactly once.
 *
 * `useSearchParams` opts the subtree into client-side rendering, so the caller
 * must wrap this in a `<Suspense>` boundary.
 */

import { usePathname, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useEffect } from "react";

export function PostHogPageview() {
    const posthog = usePostHog();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!posthog) return;
        const query = searchParams.toString();
        posthog.capture("$pageview", {
            $current_url: query ? `${pathname}?${query}` : pathname,
        });
    }, [posthog, pathname, searchParams]);

    return null;
}
