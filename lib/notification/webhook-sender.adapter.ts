/**
 * HTTP webhook sender — shared by Slack and Discord.
 *
 * Both Slack and Discord incoming webhooks accept a POST with
 * `content-type: application/json` and a JSON body. The body shape
 * differs (Slack: `{ text }`, Discord: `{ content }`) but that's
 * decided upstream by `renderWebhookPayload(channel, event)` — the
 * sender itself is agnostic.
 *
 * Safety properties enforced here:
 *
 *   - SSRF guard. The URL is validated by `resolveSafeTarget` before any
 *     network I/O. Loopback, private ranges, cloud metadata, and any
 *     hostname whose DNS lookup resolves to one of those addresses are
 *     refused. Channel URLs come from workspace members, so they're
 *     treated as untrusted input.
 *
 *   - IP pinning. `resolveSafeTarget` returns the validated public IP and
 *     the request dials *that* address (URL host swapped for the IP), while
 *     SNI and the Host header keep the original hostname. The hostname is
 *     never re-resolved for the connection, so a low-TTL attacker can't
 *     rebind it to 127.0.0.1 / 169.254.169.254 between the check and the dial.
 *
 *   - Manual redirects. `fetch` is invoked with `redirect: "manual"` so
 *     a target host can't bounce the request to an internal address
 *     after the initial DNS check passes.
 *
 *   - Per-send timeout with +/-20% jitter around a 5s base. Jitter
 *     prevents synchronised retry storms when a target is degraded.
 *
 *   - Retry with exponential backoff (1s, 2s, 4s, ... capped at 30s)
 *     and the same +/-20% jitter applied to each delay. Default 3
 *     retries; callers can override with `retries`.
 *
 * The factory exposes `resolveHost`, `fetch`, `random`, `setTimer`,
 * `clearTimer`, `sleep`, and `retries` injection seams for tests;
 * production wires `node:dns/promises`, the global `fetch`,
 * `Math.random`, and the global timer functions.
 */

import { lookup } from "node:dns/promises";
import { isIPv6 } from "node:net";
import { resolveSafeTarget, type ResolveHost, type SafeTarget } from "./safe-fetch";
import type { WebhookSender } from "./webhook-sender";

const TIMEOUT_MS = 5000;
const JITTER_FRACTION = 0.2;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const DEFAULT_RETRIES = 3;

/** Standard fetch init plus Bun's `tls` extension, used to pin SNI to the original host. */
type FetchInit = RequestInit & { readonly tls?: { readonly serverName: string } };
export type FetchFn = (input: string, init: FetchInit) => Promise<Response>;
export type SetTimerFn = (ms: number, cb: () => void) => unknown;
export type ClearTimerFn = (handle: unknown) => void;
export type SleepFn = (ms: number) => Promise<void>;

interface CreateHttpWebhookSenderDeps {
    readonly resolveHost?: ResolveHost;
    readonly fetch?: FetchFn;
    readonly random?: () => number;
    readonly setTimer?: SetTimerFn;
    readonly clearTimer?: ClearTimerFn;
    readonly sleep?: SleepFn;
    readonly retries?: number;
}

export function createHttpWebhookSender(deps: CreateHttpWebhookSenderDeps = {}): WebhookSender {
    const resolveHost = deps.resolveHost ?? defaultResolveHost;
    const fetchImpl = deps.fetch ?? fetch;
    const random = deps.random ?? Math.random;
    const setTimer: SetTimerFn = deps.setTimer ?? ((ms, cb) => setTimeout(cb, ms));
    const clearTimer: ClearTimerFn =
        deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    const sleep: SleepFn = deps.sleep ?? defaultSleep;
    const retries = deps.retries ?? DEFAULT_RETRIES;
    return {
        post: async (url: string, body: unknown): Promise<void> => {
            const target = await resolveSafeTarget(url, resolveHost);
            const payload = JSON.stringify(body);
            let lastError: unknown;
            for (let attempt = 0; attempt <= retries; attempt += 1) {
                if (attempt > 0) {
                    const baseDelay = Math.min(
                        MAX_BACKOFF_MS,
                        BASE_BACKOFF_MS * 2 ** (attempt - 1),
                    );
                    await sleep(jitter(baseDelay, random));
                }
                try {
                    await postOnce({
                        url,
                        target,
                        payload,
                        fetchImpl,
                        random,
                        setTimer,
                        clearTimer,
                    });
                    return;
                } catch (err) {
                    lastError = err;
                }
            }
            throw lastError;
        },
    };
}

interface PostOnceArgs {
    readonly url: string;
    readonly target: SafeTarget;
    readonly payload: string;
    readonly fetchImpl: FetchFn;
    readonly random: () => number;
    readonly setTimer: SetTimerFn;
    readonly clearTimer: ClearTimerFn;
}

async function postOnce(args: PostOnceArgs): Promise<void> {
    const original = new URL(args.url);
    // Dial the validated IP, but keep the original hostname for the Host header
    // and TLS SNI so vhost routing and certificate validation still work. The
    // hostname is never re-resolved, which is what closes the rebinding window.
    const hostHeader = original.host;
    const pinnedHost = isIPv6(args.target.pinnedIp)
        ? `[${args.target.pinnedIp}]`
        : args.target.pinnedIp;
    original.host = original.port ? `${pinnedHost}:${original.port}` : pinnedHost;
    const timeoutMs = jitter(TIMEOUT_MS, args.random);
    const controller = new AbortController();
    const timer = args.setTimer(timeoutMs, () => controller.abort());
    try {
        const res = await args.fetchImpl(original.toString(), {
            method: "POST",
            headers: { "content-type": "application/json", host: hostHeader },
            body: args.payload,
            signal: controller.signal,
            redirect: "manual",
            tls: { serverName: args.target.hostname },
        });
        if (!res.ok) {
            throw new Error(`webhook returned ${res.status}`);
        }
    } finally {
        args.clearTimer(timer);
    }
}

function jitter(baseMs: number, random: () => number): number {
    return baseMs + (random() - 0.5) * 2 * baseMs * JITTER_FRACTION;
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function defaultResolveHost(hostname: string): Promise<readonly string[]> {
    const records = await lookup(hostname, { all: true });
    return records.map((r) => r.address);
}

export const httpWebhookSender: WebhookSender = createHttpWebhookSender();
