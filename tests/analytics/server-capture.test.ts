/**
 * The server-side funnel capture must be inert on self-host: with no PostHog
 * key configured it makes no network call and emits no events. These tests pin
 * the no-op guard and the no-PII shape of the event payload, which is the
 * privacy-load-bearing contract of the whole analytics surface.
 */

import { anonymousId, buildCaptureRequest } from "@/lib/analytics/server-capture";
import { describe, expect, test } from "bun:test";

describe("buildCaptureRequest", () => {
    test("returns null when the PostHog key is absent (self-host stays clean)", () => {
        const request = buildCaptureRequest(
            { key: "", host: "https://us.i.posthog.com" },
            { event: "signup", distinctId: "anon-1" },
        );
        expect(request).toBeNull();
    });

    test("targets the capture endpoint with the event name and distinct id", () => {
        const request = buildCaptureRequest(
            { key: "phc_test", host: "https://us.i.posthog.com" },
            { event: "subscribed", distinctId: "anon-1" },
        );
        expect(request).not.toBeNull();
        expect(request?.url).toBe("https://us.i.posthog.com/i/v0/e/");
        const payload = JSON.parse(request?.body ?? "{}");
        expect(payload.event).toBe("subscribed");
        expect(payload.distinct_id).toBe("anon-1");
        expect(payload.api_key).toBe("phc_test");
    });

    test("carries no PII: the serialized payload has no email or raw user id", () => {
        const request = buildCaptureRequest(
            { key: "phc_test", host: "https://us.i.posthog.com" },
            {
                event: "workspace_created",
                distinctId: anonymousId("user-123"),
                properties: { plan: "cloud" },
            },
        );
        const body = request?.body ?? "";
        expect(body).not.toContain("user-123");
        expect(body).not.toContain("@");
        expect(body.toLowerCase()).not.toContain("email");
    });
});

describe("anonymousId", () => {
    test("is opaque (does not contain the raw id) and stable", () => {
        const hashed = anonymousId("user-123");
        expect(hashed).not.toContain("user-123");
        expect(hashed).toBe(anonymousId("user-123"));
    });
});
