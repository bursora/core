/** Pure date math for the spend page date range picker. */

import type { SpendWindow } from "@/lib/metering";

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

function startOfDayLocal(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDayLocal(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// Why: Sunday is the project-wide week start; locale-aware first-day-of-week
// is out of scope. Date constructor normalizes across DST boundaries.
function startOfWeekLocal(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay(), 0, 0, 0, 0);
}

function startOfMonthLocal(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function computePresetWindow(preset: PresetId, now: Date): SpendWindow {
    switch (preset) {
        case "today":
            return { from: startOfDayLocal(now), to: endOfDayLocal(now) };
        case "week-to-date":
            return { from: startOfWeekLocal(now), to: endOfDayLocal(now) };
        case "month-to-date":
            return { from: startOfMonthLocal(now), to: endOfDayLocal(now) };
        case "last-7-days":
            return {
                from: startOfDayLocal(new Date(now.getTime() - 6 * DAY_MS)),
                to: endOfDayLocal(now),
            };
        case "last-14-days":
            return {
                from: startOfDayLocal(new Date(now.getTime() - 13 * DAY_MS)),
                to: endOfDayLocal(now),
            };
        case "last-30-days":
            return {
                from: startOfDayLocal(new Date(now.getTime() - 29 * DAY_MS)),
                to: endOfDayLocal(now),
            };
    }
}

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

export function formatRangeButtonLabel(from: Date, to: Date): string {
    const fmt = new Intl.DateTimeFormat(undefined, {
        dateStyle: "short",
        timeStyle: "short",
    });
    return `${fmt.format(from)} - ${fmt.format(to)}`;
}
