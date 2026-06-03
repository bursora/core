/**
 * The `bursora_tz` cookie (`TZ_COOKIE`) carries the browser's IANA timezone to
 * the server so server components can render times in the user's local zone
 * (the client knows its zone; the server otherwise would not). Written by
 * `TimeZoneProvider`'s mount effect; read by `getRequestTimeZone` server-side.
 */

export const TZ_COOKIE = "bursora_tz";
export const TZ_COOKIE_MAX_AGE_SECONDS = 31_536_000;

/** Writes the timezone cookie from the client. */
export function setTimeZoneCookie(tz: string): void {
    document.cookie = `${TZ_COOKIE}=${tz}; path=/; max-age=${TZ_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}
