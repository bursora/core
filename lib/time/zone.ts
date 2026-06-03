/**
 * Timezone-aware date helpers — the one place the UI crosses between UTC
 * instants (how the system stores and queries everything) and the user's
 * local wall clock (how the UI must read).
 *
 * The system invariant: storage, compute, and queries are UTC instants; every
 * displayed time and every user-selected day boundary is interpreted in the
 * user's IANA zone. These helpers are the boundary — nothing else should touch
 * `Intl.DateTimeFormat`'s `timeZone` option or hand-roll offset math.
 *
 * Framework-free on purpose: imported from both client and server components,
 * so no `next/*`. The server reads the zone from a cookie (see
 * `request-tz.ts`); the client reads it from the browser. Both feed the same
 * `tz` string in here.
 *
 * Mirrors the UTC-only helpers in `lib/budgeting/period.ts`; those stay for
 * budget math (which is canonically UTC). These are the UI analog.
 */

/** The fallback/canonical zone. Storage and outbound channels are always UTC. */
export const UTC = "UTC";

interface ZonedParts {
    readonly year: number;
    readonly month: number; // 1-12
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
    readonly millisecond: number;
}

const PARTS_FMT_CACHE = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
    let fmt = PARTS_FMT_CACHE.get(tz);
    if (fmt === undefined) {
        fmt = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        PARTS_FMT_CACHE.set(tz, fmt);
    }
    return fmt;
}

/** The wall-clock components of `instant` as read in `tz`. */
function getZonedParts(instant: Date, tz: string): ZonedParts {
    const parts = partsFormatter(tz).formatToParts(instant);
    const lookup = (type: Intl.DateTimeFormatPartTypes): number => {
        const value = parts.find((p) => p.type === type)?.value ?? "0";
        return Number(value);
    };
    return {
        year: lookup("year"),
        month: lookup("month"),
        day: lookup("day"),
        hour: lookup("hour"),
        minute: lookup("minute"),
        second: lookup("second"),
        millisecond: instant.getMilliseconds(),
    };
}

/** Offset (wall-clock minus UTC) of `tz` at `instant`, in milliseconds. */
function zoneOffsetMs(instant: Date, tz: string): number {
    const p = getZonedParts(instant, tz);
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The UTC instant whose wall clock in `tz` equals `parts`. Samples the zone
 * offset at the candidate instant and refines once so a wall time that lands on
 * a DST transition resolves to the correct side.
 */
function zonedPartsToUtc(parts: ZonedParts, tz: string): Date {
    const guess = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
        parts.millisecond,
    );
    const offset = zoneOffsetMs(new Date(guess), tz);
    const refined = zoneOffsetMs(new Date(guess - offset), tz);
    return new Date(guess - refined);
}

/** Start of the day (00:00:00.000) containing `instant`, read in `tz`. */
export function startOfDayInZone(instant: Date, tz: string): Date {
    const p = getZonedParts(instant, tz);
    return zonedPartsToUtc({ ...p, hour: 0, minute: 0, second: 0, millisecond: 0 }, tz);
}

/** End of the day (23:59:59.999) containing `instant`, read in `tz`. */
export function endOfDayInZone(instant: Date, tz: string): Date {
    const p = getZonedParts(instant, tz);
    return zonedPartsToUtc({ ...p, hour: 23, minute: 59, second: 59, millisecond: 999 }, tz);
}

/** Start of the month (1st, 00:00:00.000) containing `instant`, read in `tz`. */
export function startOfMonthInZone(instant: Date, tz: string): Date {
    const p = getZonedParts(instant, tz);
    return zonedPartsToUtc({ ...p, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }, tz);
}

/**
 * Start of the week (Sunday, 00:00:00.000) containing `instant`, read in `tz`.
 * Sunday-anchored to match the date picker's calendar; budget weeks (ISO,
 * Monday) live in `lib/budgeting/period.ts`.
 */
export function startOfWeekInZone(instant: Date, tz: string): Date {
    const p = getZonedParts(instant, tz);
    // Weekday is zone-independent given y/m/d, so read it off a UTC construction.
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    return zonedPartsToUtc(
        { ...p, day: p.day - weekday, hour: 0, minute: 0, second: 0, millisecond: 0 },
        tz,
    );
}

const DISPLAY_FMT_CACHE = new Map<string, Intl.DateTimeFormat>();

/** A display formatter for `tz`/`opts`, cached — construction is Intl's real cost. */
function displayFormatter(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = `${tz}|${JSON.stringify(opts)}`;
    let fmt = DISPLAY_FMT_CACHE.get(key);
    if (fmt === undefined) {
        fmt = new Intl.DateTimeFormat("en-US", { ...opts, timeZone: tz });
        DISPLAY_FMT_CACHE.set(key, fmt);
    }
    return fmt;
}

/** Formats `instant` for display in `tz`. The single display boundary. */
export function formatInZone(instant: Date, tz: string, opts: Intl.DateTimeFormatOptions): string {
    return displayFormatter(tz, opts).format(instant);
}

const ABBREV_OPTS: Intl.DateTimeFormatOptions = { timeZoneName: "short" };

/** Short zone label for `instant` in `tz` (e.g. "UTC", "PDT", "GMT+2"). */
export function zoneAbbrev(instant: Date, tz: string): string {
    const parts = displayFormatter(tz, ABBREV_OPTS).formatToParts(instant);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/**
 * Guards a timezone string before it reaches `Intl` (an invalid zone throws).
 * The value comes from a client-set cookie, so treat it as untrusted input.
 */
export function isValidTimeZone(value: string): boolean {
    if (value.length === 0) return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
    } catch {
        return false;
    }
}
