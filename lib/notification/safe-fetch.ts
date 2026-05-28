/**
 * SSRF + transport guard for outbound webhook URLs.
 *
 * Outbound webhook URLs are workspace-controlled (rows in `notification_channels`).
 * Without validation, a member can point a channel at loopback, private
 * networks, or cloud metadata (169.254.169.254) to exfiltrate data through
 * the alert payload. Plain http:// is rejected too, so an on-path attacker
 * cannot MITM the rendered payload. This module is the choke point: every
 * outbound webhook must pass `assertSafeUrl` before fetch.
 */

import { isIPv4, isIPv6 } from "node:net";

const IPV4_MAPPED_PREFIX = "::ffff:";
const ALLOWED_SCHEMES = new Set(["https:"]);

export type ResolveHost = (hostname: string) => Promise<readonly string[]>;

export class SafeFetchUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SafeFetchUrlError";
    }
}

export async function assertSafeUrl(url: string, resolveHost: ResolveHost): Promise<void> {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new SafeFetchUrlError(`invalid url: ${url}`);
    }
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
        throw new SafeFetchUrlError(`forbidden scheme: ${parsed.protocol}`);
    }
    const hostname = normalizeHostname(parsed.hostname);
    if (isIPv4(hostname) || isIPv6(hostname)) {
        if (isPrivateIp(hostname)) {
            throw new SafeFetchUrlError(`forbidden host ip: ${hostname}`);
        }
        return;
    }
    let resolved: readonly string[];
    try {
        resolved = await resolveHost(hostname);
    } catch (err) {
        throw new SafeFetchUrlError(
            `dns lookup failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    if (resolved.length === 0) {
        throw new SafeFetchUrlError(`dns lookup returned no records for ${hostname}`);
    }
    for (const ip of resolved) {
        if (isPrivateIp(ip)) {
            throw new SafeFetchUrlError(`hostname ${hostname} resolved to forbidden ip ${ip}`);
        }
    }
}

function normalizeHostname(hostname: string): string {
    // Strip an IPv6 literal's brackets and a single trailing dot (a valid FQDN
    // form per RFC 1034) in one place. The trailing dot resolves to the same
    // host but can dodge exact-hostname WAF/firewall rules, so it never reaches
    // resolution or IP classification.
    const unbracketed =
        hostname.startsWith("[") && hostname.endsWith("]")
            ? hostname.slice(1, -1)
            : hostname;
    return unbracketed.replace(/\.$/, "");
}

export function isPrivateIp(ip: string): boolean {
    if (isIPv4(ip)) return isPrivateIpv4(ip);
    if (isIPv6(ip)) return isPrivateIpv6(ip);
    return true; // unparseable input is always treated as unsafe
}

function isPrivateIpv4(ip: string): boolean {
    const parts = ip.split(".").map(Number);
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    if (a === 0) return true; // 0.0.0.0/8 unspecified
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    return false;
}

function isPrivateIpv6(ip: string): boolean {
    const normalized = ip.toLowerCase();

    // IPv4-mapped IPv6 (::ffff:a.b.c.d): classify by the embedded IPv4.
    if (normalized.startsWith(IPV4_MAPPED_PREFIX)) {
        const v4 = normalized.slice(IPV4_MAPPED_PREFIX.length);
        if (isIPv4(v4)) return isPrivateIpv4(v4);
        return true;
    }

    if (normalized === "::") return true; // unspecified
    if (normalized === "::1") return true; // loopback

    // fc00::/7 → unique-local (covers fc and fd prefixes).
    if (/^f[cd][0-9a-f]{0,2}:/.test(normalized)) return true;

    // fe80::/10 → link-local.
    if (/^fe[89ab][0-9a-f]?:/.test(normalized)) return true;

    return false;
}
