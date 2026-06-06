import "server-only";

import { env } from "@/lib/env";
import { after } from "next/server";
import { createHash } from "node:crypto";
import type { FunnelEvent } from "./events";
import { redactSensitiveUrl } from "./redact-url";

export interface PostHogConfig {
    /** PostHog project API key. Empty string means analytics is off. */
    readonly key: string;
    /** PostHog ingestion host, e.g. https://us.i.posthog.com. */
    readonly host: string;
}

export interface CaptureInput {
    readonly event: FunnelEvent;
    /**
     * Opaque, already-hashed actor id used only to stitch the funnel together.
     * Never a raw user id, email, or any other PII. Pass through
     * `anonymousId()` before handing a real id here.
     */
    readonly distinctId: string;
    /** Extra event properties. Caller is responsible for keeping these PII-free. */
    readonly properties?: Readonly<Record<string, string | number | boolean>>;
}

export interface CaptureRequest {
    readonly url: string;
    readonly body: string;
}

/**
 * Build the PostHog capture HTTP request for a funnel event, or `null` when no
 * key is configured. The null path is the self-host guard: without a key there
 * is no request to send, so nothing reaches the network. Pure and synchronous
 * so the no-op guard and the no-PII payload shape are unit-testable without a
 * live PostHog.
 */
export function buildCaptureRequest(
    config: PostHogConfig,
    input: CaptureInput,
): CaptureRequest | null {
    if (config.key.length === 0) return null;
    const host = config.host.replace(/\/$/, "");
    return {
        url: `${host}/i/v0/e/`,
        body: JSON.stringify({
            api_key: config.key,
            event: input.event,
            distinct_id: input.distinctId,
            properties: redactProperties(input.properties),
            timestamp: new Date().toISOString(),
        }),
    };
}

// Scrub invite tokens / `next=` targets from any string property, mirroring the
// client's `sanitize_properties`. Keeps the no-PII-URL guarantee structural on
// both capture paths instead of trusting each server caller to send clean props.
// No-ops on clean strings.
function redactProperties(
    properties: CaptureInput["properties"],
): Record<string, string | number | boolean> {
    if (!properties) return {};
    return Object.fromEntries(
        Object.entries(properties).map(([key, value]) =>
            typeof value === "string" ? [key, redactSensitiveUrl(value)] : [key, value],
        ),
    );
}

/**
 * Hash a raw id (user id, workspace id) into an opaque, stable distinct id.
 * Keeps funnel stitching possible without ever sending the raw id to PostHog.
 */
export function anonymousId(rawId: string): string {
    return createHash("sha256").update(rawId).digest("hex").slice(0, 32);
}

/** Cap on the analytics beacon so a hung PostHog endpoint can't pin a worker. */
const CAPTURE_TIMEOUT_MS = 2_000;

/**
 * Fire-and-forget server-side funnel capture. No-ops when PostHog is not
 * configured (self-host). Never adds latency to the user response: the network
 * send is deferred with `after()` so it runs once the response is flushed, and
 * the fetch carries a short abort timeout so a hung endpoint can't hold a worker
 * open. Never throws into the caller: analytics must not break a checkout, an
 * ingest, or a workspace creation.
 */
export async function captureServerEvent(input: CaptureInput): Promise<void> {
    const request = buildCaptureRequest(
        { key: env().POSTHOG_KEY, host: env().POSTHOG_HOST },
        input,
    );
    if (request === null) return;
    after(async () => {
        try {
            await fetch(request.url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: request.body,
                signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
            });
        } catch {
            // Best-effort. A dropped or timed-out analytics beacon must never
            // surface to the user.
        }
    });
}
