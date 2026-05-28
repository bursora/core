/**
 * Best-effort client IP from proxy headers. `x-forwarded-for` may carry a
 * comma-separated chain (`client, proxy1, proxy2`); the first entry is the
 * original client. Falls back to `x-real-ip`. Returns null when neither header
 * is set. No header forging is rejected here — the value is only ever used as
 * a log/fingerprint correlate, never a security boundary.
 *
 * Accepts anything with a `get(name)` reader, so both `Request.headers` and the
 * `next/headers` result satisfy it.
 */
export function clientIpFromHeaders(headers: Pick<Headers, "get">): string | null {
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded !== null) {
        const first = forwarded.split(",", 1)[0]?.trim();
        if (first !== undefined && first.length > 0) return first;
    }
    const real = headers.get("x-real-ip");
    if (real !== null && real.trim().length > 0) return real.trim();
    return null;
}
