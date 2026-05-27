/**
 * Tests for SSRF guards on outbound webhook URLs.
 *
 * Outbound webhook URLs come from `notification_channels`, where a workspace
 * member can write any string. Without validation, an attacker can point a
 * channel at internal services (127.0.0.1, ::1, 10/8, 172.16/12, 192.168/16)
 * or cloud metadata (169.254.169.254) and exfiltrate data via the rendered
 * alert payload.
 */

import {
    assertSafeUrl,
    isPrivateIp,
    SafeFetchUrlError,
} from "@/lib/notification/safe-fetch";
import { describe, expect, test } from "bun:test";

describe("isPrivateIp", () => {
    test("127.0.0.1 is forbidden (IPv4 loopback)", () => {
        expect(isPrivateIp("127.0.0.1")).toBe(true);
    });

    test("any 127.x.x.x is forbidden (whole 127/8 loopback block)", () => {
        expect(isPrivateIp("127.255.255.254")).toBe(true);
    });

    test("8.8.8.8 is allowed (public IPv4)", () => {
        expect(isPrivateIp("8.8.8.8")).toBe(false);
    });

    test("0.0.0.0 is forbidden (unspecified, whole 0/8)", () => {
        expect(isPrivateIp("0.0.0.0")).toBe(true);
    });

    test("10.0.0.1 is forbidden (private 10/8)", () => {
        expect(isPrivateIp("10.0.0.1")).toBe(true);
    });

    test("172.16.0.1 is forbidden (private 172.16/12 lower bound)", () => {
        expect(isPrivateIp("172.16.0.1")).toBe(true);
    });

    test("172.31.255.254 is forbidden (private 172.16/12 upper bound)", () => {
        expect(isPrivateIp("172.31.255.254")).toBe(true);
    });

    test("172.32.0.1 is allowed (just outside 172.16/12)", () => {
        expect(isPrivateIp("172.32.0.1")).toBe(false);
    });

    test("172.15.255.254 is allowed (just below 172.16/12)", () => {
        expect(isPrivateIp("172.15.255.254")).toBe(false);
    });

    test("192.168.1.1 is forbidden (private 192.168/16)", () => {
        expect(isPrivateIp("192.168.1.1")).toBe(true);
    });

    test("169.254.169.254 is forbidden (cloud metadata, link-local 169.254/16)", () => {
        expect(isPrivateIp("169.254.169.254")).toBe(true);
    });

    test("100.64.0.1 is forbidden (carrier-grade NAT 100.64/10 lower bound)", () => {
        expect(isPrivateIp("100.64.0.1")).toBe(true);
    });

    test("100.127.255.254 is forbidden (carrier-grade NAT 100.64/10 upper bound)", () => {
        expect(isPrivateIp("100.127.255.254")).toBe(true);
    });

    test("100.128.0.1 is allowed (just outside 100.64/10)", () => {
        expect(isPrivateIp("100.128.0.1")).toBe(false);
    });

    test("1.1.1.1 is allowed (public IPv4)", () => {
        expect(isPrivateIp("1.1.1.1")).toBe(false);
    });

    test("not-an-ip is treated as forbidden (defensive default)", () => {
        // Invalid IP strings should never sneak through. `assertSafeUrl`
        // never passes a non-IP here (DNS results are always IPs), but
        // the function should still be safe if misused.
        expect(isPrivateIp("not-an-ip")).toBe(true);
    });

    test("::1 is forbidden (IPv6 loopback)", () => {
        expect(isPrivateIp("::1")).toBe(true);
    });

    test(":: is forbidden (IPv6 unspecified)", () => {
        expect(isPrivateIp("::")).toBe(true);
    });

    test("fc00::1 is forbidden (IPv6 unique-local)", () => {
        expect(isPrivateIp("fc00::1")).toBe(true);
    });

    test("fd12:3456:789a::1 is forbidden (IPv6 unique-local, fd prefix)", () => {
        expect(isPrivateIp("fd12:3456:789a::1")).toBe(true);
    });

    test("fe80::1 is forbidden (IPv6 link-local)", () => {
        expect(isPrivateIp("fe80::1")).toBe(true);
    });

    test("::ffff:127.0.0.1 is forbidden (IPv4-mapped loopback)", () => {
        expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    });

    test("::ffff:10.0.0.1 is forbidden (IPv4-mapped private)", () => {
        expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
    });

    test("::ffff:8.8.8.8 is allowed (IPv4-mapped public)", () => {
        expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
    });

    test("2606:4700::1111 is allowed (public IPv6)", () => {
        expect(isPrivateIp("2606:4700::1111")).toBe(false);
    });
});

describe("assertSafeUrl", () => {
    const publicDns = async (): Promise<readonly string[]> => ["8.8.8.8"];

    test("public https URL with public DNS result resolves", async () => {
        await expect(
            assertSafeUrl("https://hooks.slack.com/abc", publicDns),
        ).resolves.toBeUndefined();
    });

    test("plain http URL rejected (HTTPS-only)", async () => {
        // On-path attackers can MITM plain-http webhook payloads. The
        // SSRF guard is the only choke point every outbound webhook
        // passes through, so it refuses non-https schemes regardless of
        // hostname.
        await expect(
            assertSafeUrl("http://hooks.example.com/abc", publicDns),
        ).rejects.toBeInstanceOf(SafeFetchUrlError);
    });

    test("mixed-case HTTP:// URL rejected (scheme normalized to http:)", async () => {
        await expect(
            assertSafeUrl("HTTP://hooks.example.com/abc", publicDns),
        ).rejects.toBeInstanceOf(SafeFetchUrlError);
    });

    test("invalid URL throws SafeFetchUrlError", async () => {
        await expect(assertSafeUrl("not a url", publicDns)).rejects.toBeInstanceOf(
            SafeFetchUrlError,
        );
    });

    test("file:// scheme rejected", async () => {
        await expect(
            assertSafeUrl("file:///etc/passwd", publicDns),
        ).rejects.toBeInstanceOf(SafeFetchUrlError);
    });

    test("ftp:// scheme rejected", async () => {
        await expect(
            assertSafeUrl("ftp://example.com/", publicDns),
        ).rejects.toBeInstanceOf(SafeFetchUrlError);
    });

    test("gopher:// scheme rejected", async () => {
        await expect(
            assertSafeUrl("gopher://example.com/", publicDns),
        ).rejects.toBeInstanceOf(SafeFetchUrlError);
    });

    test("hostname == 127.0.0.1 rejected without DNS lookup", async () => {
        let called = false;
        const resolve = async (): Promise<readonly string[]> => {
            called = true;
            return ["8.8.8.8"];
        };
        await expect(assertSafeUrl("http://127.0.0.1/", resolve)).rejects.toBeInstanceOf(
            SafeFetchUrlError,
        );
        expect(called).toBe(false);
    });

    test("hostname == [::1] rejected (IPv6 loopback literal in URL)", async () => {
        await expect(assertSafeUrl("http://[::1]/", publicDns)).rejects.toBeInstanceOf(
            SafeFetchUrlError,
        );
    });

    test("hostname is private IPv4 literal (10.0.0.1) rejected", async () => {
        await expect(
            assertSafeUrl("http://10.0.0.1/", publicDns),
        ).rejects.toBeInstanceOf(SafeFetchUrlError);
    });

    test("hostname is cloud metadata literal (169.254.169.254) rejected", async () => {
        await expect(
            assertSafeUrl("http://169.254.169.254/latest/meta-data/", publicDns),
        ).rejects.toBeInstanceOf(SafeFetchUrlError);
    });

    test("hostname resolves to private IP via DNS rejected", async () => {
        const resolveToPrivate = async (): Promise<readonly string[]> => ["10.0.0.1"];
        await expect(
            assertSafeUrl("http://internal-rebind.example.com/", resolveToPrivate),
        ).rejects.toBeInstanceOf(SafeFetchUrlError);
    });

    test("hostname resolves to a mix of public + private (DNS-rebind) rejected", async () => {
        // Defense against TOCTOU-style rebind: any single private IP in
        // the resolved set must reject the whole URL.
        const resolveMix = async (): Promise<readonly string[]> => ["8.8.8.8", "10.0.0.1"];
        await expect(
            assertSafeUrl("http://rebind.example.com/", resolveMix),
        ).rejects.toBeInstanceOf(SafeFetchUrlError);
    });

    test("hostname resolves to no IPs (empty result) rejected", async () => {
        const resolveEmpty = async (): Promise<readonly string[]> => [];
        await expect(
            assertSafeUrl("http://no-dns.example.com/", resolveEmpty),
        ).rejects.toBeInstanceOf(SafeFetchUrlError);
    });

    test("DNS lookup throws: surfaced as SafeFetchUrlError", async () => {
        const resolveThrow = async (): Promise<readonly string[]> => {
            throw new Error("ENOTFOUND");
        };
        await expect(
            assertSafeUrl("http://nx.example.com/", resolveThrow),
        ).rejects.toBeInstanceOf(SafeFetchUrlError);
    });
});
