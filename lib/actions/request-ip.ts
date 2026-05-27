import "server-only";

import { headers } from "next/headers";

/**
 * Best-effort client IP for server actions. Reads `x-forwarded-for`
 * (first hop) or falls back to `x-real-ip`. Returns null when neither
 * header is set. Mirrors the API-route helper in `lib/identity/with-bursora-key.ts`
 * — the value is a log/fingerprint correlate, never a security boundary.
 */
export async function requestSourceIp(): Promise<string | null> {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded !== null) {
        const first = forwarded.split(",", 1)[0]?.trim();
        if (first !== undefined && first.length > 0) return first;
    }
    const real = h.get("x-real-ip");
    if (real !== null && real.trim().length > 0) return real.trim();
    return null;
}
