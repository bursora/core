/**
 * Tests for the HTTP webhook sender adapter.
 *
 * Adapter wraps `fetch` for outbound Slack/Discord webhooks. Two
 * guarantees verified here:
 *
 *   1. SSRF guard. The URL passes `assertSafeUrl` before any network
 *      I/O. Loopback, private ranges, cloud metadata, and DNS-rebind
 *      targets must throw before `fetch` is called.
 *
 *   2. Manual redirects. `fetch` is invoked with `redirect: "manual"`
 *      so a target host cannot bounce the request to an internal
 *      address after the initial DNS check.
 *
 * The factory exposes injectable seams for `resolveHost` and `fetch` so
 * the tests stay hermetic.
 */

import { SafeFetchUrlError } from "@/lib/notification/safe-fetch";
import { createHttpWebhookSender } from "@/lib/notification/webhook-sender.adapter";
import { describe, expect, test } from "bun:test";

const publicDns = async (): Promise<readonly string[]> => ["8.8.8.8"];

describe("createHttpWebhookSender", () => {
    test("rejects URL pointing at 127.0.0.1 without calling fetch", async () => {
        let fetchCalls = 0;
        const sender = createHttpWebhookSender({
            resolveHost: publicDns,
            fetch: async () => {
                fetchCalls += 1;
                return new Response(null, { status: 200 });
            },
        });
        await expect(sender.post("http://127.0.0.1/abc", { text: "x" })).rejects.toBeInstanceOf(
            SafeFetchUrlError,
        );
        expect(fetchCalls).toBe(0);
    });

    test("rejects plain http:// URL without calling fetch (HTTPS-only)", async () => {
        let fetchCalls = 0;
        const sender = createHttpWebhookSender({
            resolveHost: publicDns,
            fetch: async () => {
                fetchCalls += 1;
                return new Response(null, { status: 200 });
            },
        });
        await expect(
            sender.post("http://hooks.example.com/abc", { text: "x" }),
        ).rejects.toBeInstanceOf(SafeFetchUrlError);
        expect(fetchCalls).toBe(0);
    });

    test("rejects URL whose DNS resolves to a private IP (DNS-rebind)", async () => {
        let fetchCalls = 0;
        const sender = createHttpWebhookSender({
            resolveHost: async () => ["8.8.8.8", "10.0.0.1"],
            fetch: async () => {
                fetchCalls += 1;
                return new Response(null, { status: 200 });
            },
        });
        await expect(
            sender.post("https://hooks.example.com/abc", { text: "x" }),
        ).rejects.toBeInstanceOf(SafeFetchUrlError);
        expect(fetchCalls).toBe(0);
    });

    test("calls fetch with redirect: 'manual' on a safe URL", async () => {
        let observedInit: RequestInit | undefined;
        const sender = createHttpWebhookSender({
            resolveHost: publicDns,
            fetch: async (_input, init) => {
                observedInit = init;
                return new Response(null, { status: 200 });
            },
        });
        await sender.post("https://hooks.slack.com/abc", { text: "hi" });
        expect(observedInit?.redirect).toBe("manual");
    });

    test("calls fetch with a POST and JSON body for safe URLs", async () => {
        let observedInit: RequestInit | undefined;
        const sender = createHttpWebhookSender({
            resolveHost: publicDns,
            fetch: async (_input, init) => {
                observedInit = init;
                return new Response(null, { status: 200 });
            },
        });
        await sender.post("https://hooks.slack.com/abc", { text: "hello" });
        expect(observedInit?.method).toBe("POST");
        expect(observedInit?.body).toBe(JSON.stringify({ text: "hello" }));
    });

    test("throws when fetch returns a non-2xx status (e.g. 302 redirect with manual)", async () => {
        const sender = createHttpWebhookSender({
            resolveHost: publicDns,
            fetch: async () => new Response(null, { status: 302 }),
            retries: 0,
        });
        await expect(sender.post("https://hooks.slack.com/abc", { text: "x" })).rejects.toThrow(
            /302/,
        );
    });

    test("with random()=0.5 the per-send timeout equals the base (no jitter offset)", async () => {
        const setTimerCalls: number[] = [];
        const sender = createHttpWebhookSender({
            resolveHost: publicDns,
            fetch: async () => new Response(null, { status: 200 }),
            random: () => 0.5,
            setTimer: (ms, _cb) => {
                setTimerCalls.push(ms);
                return 1;
            },
            clearTimer: () => {},
        });
        await sender.post("https://hooks.slack.com/abc", { text: "x" });
        expect(setTimerCalls[0]).toBe(5000);
    });

    test("with random()=0 the per-send timeout is base minus 20%", async () => {
        const setTimerCalls: number[] = [];
        const sender = createHttpWebhookSender({
            resolveHost: publicDns,
            fetch: async () => new Response(null, { status: 200 }),
            random: () => 0,
            setTimer: (ms, _cb) => {
                setTimerCalls.push(ms);
                return 1;
            },
            clearTimer: () => {},
        });
        await sender.post("https://hooks.slack.com/abc", { text: "x" });
        expect(setTimerCalls[0]).toBe(4000);
    });

    test("with random()=1 the per-send timeout is base plus 20%", async () => {
        const setTimerCalls: number[] = [];
        const sender = createHttpWebhookSender({
            resolveHost: publicDns,
            fetch: async () => new Response(null, { status: 200 }),
            random: () => 1,
            setTimer: (ms, _cb) => {
                setTimerCalls.push(ms);
                return 1;
            },
            clearTimer: () => {},
        });
        await sender.post("https://hooks.slack.com/abc", { text: "x" });
        expect(setTimerCalls[0]).toBe(6000);
    });

    test("retries failed requests with exponential backoff (1s, 2s, 4s) using random=0.5", async () => {
        let fetchCalls = 0;
        const sleepDelays: number[] = [];
        const sender = createHttpWebhookSender({
            resolveHost: publicDns,
            fetch: async () => {
                fetchCalls += 1;
                return new Response(null, { status: 500 });
            },
            random: () => 0.5,
            sleep: async (ms) => {
                sleepDelays.push(ms);
            },
        });
        await expect(sender.post("https://hooks.slack.com/abc", { text: "x" })).rejects.toThrow(
            /500/,
        );
        // 1 initial + 3 retries = 4 attempts
        expect(fetchCalls).toBe(4);
        // 3 delays between the 4 attempts
        expect(sleepDelays).toEqual([1000, 2000, 4000]);
    });

    test("backoff delay is capped at 30s", async () => {
        let fetchCalls = 0;
        const sleepDelays: number[] = [];
        const sender = createHttpWebhookSender({
            resolveHost: publicDns,
            fetch: async () => {
                fetchCalls += 1;
                return new Response(null, { status: 500 });
            },
            random: () => 0.5,
            sleep: async (ms) => {
                sleepDelays.push(ms);
            },
            retries: 8,
        });
        await expect(sender.post("https://hooks.slack.com/abc", { text: "x" })).rejects.toThrow(
            /500/,
        );
        // attempts: 1 + 8 retries = 9, so 8 delays
        expect(fetchCalls).toBe(9);
        // 1s, 2s, 4s, 8s, 16s, 30s (capped), 30s, 30s
        expect(sleepDelays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    });

    test("sleep delay carries ±20% jitter via the random source", async () => {
        const sleepDelays: number[] = [];
        const sender = createHttpWebhookSender({
            resolveHost: publicDns,
            fetch: async () => new Response(null, { status: 500 }),
            random: () => 0, // -20% jitter on every call
            sleep: async (ms) => {
                sleepDelays.push(ms);
            },
            retries: 2,
        });
        await expect(sender.post("https://hooks.slack.com/abc", { text: "x" })).rejects.toThrow(
            /500/,
        );
        // 1000 * 0.8 = 800, 2000 * 0.8 = 1600
        expect(sleepDelays).toEqual([800, 1600]);
    });

    test("stops retrying as soon as a request succeeds", async () => {
        let fetchCalls = 0;
        const sleepDelays: number[] = [];
        const sender = createHttpWebhookSender({
            resolveHost: publicDns,
            fetch: async () => {
                fetchCalls += 1;
                if (fetchCalls < 3) return new Response(null, { status: 500 });
                return new Response(null, { status: 200 });
            },
            random: () => 0.5,
            sleep: async (ms) => {
                sleepDelays.push(ms);
            },
        });
        await sender.post("https://hooks.slack.com/abc", { text: "x" });
        expect(fetchCalls).toBe(3);
        expect(sleepDelays).toEqual([1000, 2000]);
    });
});
