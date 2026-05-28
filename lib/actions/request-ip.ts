import "server-only";

import { headers } from "next/headers";

import { clientIpFromHeaders } from "@/lib/client-ip";

/**
 * Best-effort client IP for server actions, read from the request headers.
 * The value is a log/fingerprint correlate, never a security boundary.
 */
export async function requestSourceIp(): Promise<string | null> {
    return clientIpFromHeaders(await headers());
}
