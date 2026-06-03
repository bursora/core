/** Pure date math for the spend page date range picker. */

import type { SpendWindow } from "@/lib/metering";
import {
    endOfDayInZone,
    formatInZone,
    startOfDayInZone,
    startOfMonthInZone,
    startOfWeekInZone,
} from "@/lib/time/zone";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type PresetId =
    | "today"
    | "week-to-date"
    | "month-to-date"
    | "last-7-days"
    | "last-14-days"
    | "last-30-days";

export interface Preset {
    readonly id: PresetId;
    readonly label: string;
}

export const PRESETS: readonly Preset[] = [
    { id: "today", label: "Today" },
    { id: "week-to-date", label: "Week to date" },
    { id: "month-to-date", label: "Month to date" },
    { id: "last-7-days", label: "Last 7 days" },
    { id: "last-14-days", label: "Last 14 days" },
    { id: "last-30-days", label: "Last 30 days" },
];

// Preset windows are day-aligned in the user's timezone, so "Today" is the
// user's local today and the picked range matches the default the server
// resolves for the same zone. Boundaries are returned as UTC instants — the
// query layer stays UTC. The Sunday week start is the picker's own; budget
// weeks (ISO/Monday) live in period.ts.
export function computePresetWindow(preset: PresetId, now: Date, tz: string): SpendWindow {
    switch (preset) {
        case "today":
            return { from: startOfDayInZone(now, tz), to: endOfDayInZone(now, tz) };
        case "week-to-date":
            return { from: startOfWeekInZone(now, tz), to: endOfDayInZone(now, tz) };
        case "month-to-date":
            return { from: startOfMonthInZone(now, tz), to: endOfDayInZone(now, tz) };
        case "last-7-days":
            return {
                from: startOfDayInZone(new Date(now.getTime() - 6 * DAY_MS), tz),
                to: endOfDayInZone(now, tz),
            };
        case "last-14-days":
            return {
                from: startOfDayInZone(new Date(now.getTime() - 13 * DAY_MS), tz),
                to: endOfDayInZone(now, tz),
            };
        case "last-30-days":
            return {
                from: startOfDayInZone(new Date(now.getTime() - 29 * DAY_MS), tz),
                to: endOfDayInZone(now, tz),
            };
    }
}

// The interactive editors below (calendar day merge, time inputs) work in the
// browser's own zone, because react-day-picker and `<input type="time">` are
// inherently browser-local. That stays consistent with the tz-rendered button
// label and presets because the `tz` cookie is written FROM the browser zone
// (see `TimeZoneProvider`), so cookie tz == browser zone for every real user.
export function applyDayToDateTime(original: Date, newDay: Date): Date {
    return new Date(
        newDay.getFullYear(),
        newDay.getMonth(),
        newDay.getDate(),
        original.getHours(),
        original.getMinutes(),
        original.getSeconds(),
        original.getMilliseconds(),
    );
}

const TIME_INPUT_RE = /^([0-9]{2}):([0-9]{2})$/;

export function applyTimeToDate(original: Date, timeString: string): Date {
    const match = TIME_INPUT_RE.exec(timeString);
    if (!match) return original;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return original;
    return new Date(
        original.getFullYear(),
        original.getMonth(),
        original.getDate(),
        hours,
        minutes,
        0,
        0,
    );
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

export function formatTimeInput(d: Date): string {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatRangeButtonLabel(from: Date, to: Date, tz: string): string {
    const opts: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };
    return `${formatInZone(from, tz, opts)} - ${formatInZone(to, tz, opts)}`;
}
