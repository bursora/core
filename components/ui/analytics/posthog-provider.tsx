"use client";

/**
 * Client-side PostHog init for the dashboard funnel.
 *
 * Config-gated: the key + host come from the server (read at runtime via `env()`
 * in the root layout and passed as props), so a self-host build with no
 * `POSTHOG_KEY` passes an empty key and the provider mounts nothing and loads no
 * PostHog script. The key is the publishable `phc_` project key, so handing it
 * to the browser is by design.
 *
 * Privacy-light: autocapture scrapes clicks and form submits, but PostHog masks
 * input values by default and we mark every key/secret/email-bearing element
 * with `ph-no-capture` so neither value nor text is captured. Person profiles
 * are identified-only, and the few funnel events we send carry no PII (see
 * `lib/analytics`). Pageviews fire manually on client navigation; the signed-in
 * user is identified by a server-computed hashed id (see `AnalyticsIdentity`).
 *
 * URL props leak across `ph-no-capture` (it scrubs element text/values, not the
 * URL), and this provider is mounted at the app root, so it wraps
 * `/invite/[token]`. `sanitize_properties` redacts the invite token and any
 * `next=` target from every URL-bearing property before an event is sent.
 */

import { PostHogPageview } from "@/components/ui/analytics/posthog-pageview";
import { redactSensitiveUrl } from "@/lib/analytics/redact-url";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { type ReactNode, Suspense, useEffect } from "react";

interface PostHogProviderProps {
    children: ReactNode;
    /** Publishable `phc_` project key; empty string disables PostHog entirely. */
    posthogKey: string;
    posthogHost: string;
}

export function PostHogProvider({ children, posthogKey, posthogHost }: PostHogProviderProps) {
    useEffect(() => {
        if (!posthogKey || posthog.__loaded) return;
        posthog.init(posthogKey, {
            api_host: posthogHost,
            autocapture: true,
            capture_pageview: false,
            capture_pageleave: true,
            person_profiles: "identified_only",
            sanitize_properties: (properties) => {
                // Redact every string property, not a fixed key list: PostHog also
                // attaches URL-bearing `$initial_*` / campaign props (set-once) that
                // capture the landing URL, so an invite token in the first session's
                // URL would otherwise leak. `redactSensitiveUrl` no-ops clean strings.
                for (const key in properties) {
                    const value = properties[key];
                    if (typeof value === "string") properties[key] = redactSensitiveUrl(value);
                }
                return properties;
            },
        });
    }, [posthogKey, posthogHost]);

    if (!posthogKey) return <>{children}</>;
    return (
        <PHProvider client={posthog}>
            <Suspense fallback={null}>
                <PostHogPageview />
            </Suspense>
            {children}
        </PHProvider>
    );
}
