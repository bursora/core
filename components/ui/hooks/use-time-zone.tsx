"use client";

import { setTimeZoneCookie } from "@/lib/time/cookie";
import { createContext, type ReactNode, useContext, useEffect } from "react";

/**
 * Owns the user's timezone end to end:
 *
 *  - Writes the browser's IANA zone to the `bursora_tz` cookie on mount, so the
 *    next server render knows it. Mounted once at the root layout, this runs on
 *    every app page (login included), so the dashboard's first render already
 *    has the cookie.
 *  - Distributes the server-resolved zone (`tz`, read from that cookie) to
 *    client components via context.
 *
 * Why context and not a browser read in each consumer: the server formats its
 * times in `tz`, and client components must format theirs in the *same* zone on
 * first render or hydration mismatches and the times flicker (UTC → local) once
 * the client takes over. Seeding context from the server's cookie value makes
 * server and client agree on the first paint — no mismatch, no flicker. The
 * default is UTC, matching the server's fallback before the cookie exists.
 */
const TimeZoneContext = createContext<string>("UTC");

interface TimeZoneProviderProps {
    readonly tz: string;
    readonly children: ReactNode;
}

export function TimeZoneProvider({ tz, children }: TimeZoneProviderProps) {
    useEffect(() => {
        setTimeZoneCookie(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }, []);
    return <TimeZoneContext.Provider value={tz}>{children}</TimeZoneContext.Provider>;
}

export function useTimeZone(): string {
    return useContext(TimeZoneContext);
}
