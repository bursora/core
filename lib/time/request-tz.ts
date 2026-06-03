/**
 * Server-side read of the user's timezone, from the `bursora_tz` cookie
 * (`TZ_COOKIE`) the browser sets (see `cookie.ts`; written by `TimeZoneProvider`'s
 * mount effect). Falls back to UTC before the cookie exists (first paint)
 * or if the value is junk, so server components always have a usable zone.
 */

import "server-only";

import { cookies } from "next/headers";
import { TZ_COOKIE } from "./cookie";
import { isValidTimeZone, UTC } from "./zone";

export async function getRequestTimeZone(): Promise<string> {
    const value = (await cookies()).get(TZ_COOKIE)?.value;
    if (value !== undefined && isValidTimeZone(value)) return value;
    return UTC;
}
