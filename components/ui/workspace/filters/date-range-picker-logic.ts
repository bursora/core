/** Pure date math for the spend page date range picker. */

import { endOfDayUtc, startOfDayUtc, startOfMonthUtc } from "@/lib/budgeting/period";
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

// Preset windows are UTC, the same frame ClickHouse buckets/partitions in, so a
// quick-pick range lines up with the chart buckets and reads identically on any
// host timezone. Day/month boundaries come from the shared period helpers;
// startOfWeekUtc stays local because the picker's Sunday week start differs from
// period.ts's ISO/Monday budget weeks.
function startOfWeekUtc(d: Date): Date {
    return new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay(), 0, 0, 0, 0),
    );
}

export function computePresetWindow(preset: PresetId, now: Date): SpendWindow {
    switch (preset) {
        case "today":
            return { from: startOfDayUtc(now), to: endOfDayUtc(now) };
        case "week-to-date":
            return { from: startOfWeekUtc(now), to: endOfDayUtc(now) };
        case "month-to-date":
            return { from: startOfMonthUtc(now), to: endOfDayUtc(now) };
        case "last-7-days":
            return {
                from: startOfDayUtc(new Date(now.getTime() - 6 * DAY_MS)),
                to: endOfDayUtc(now),
            };
        case "last-14-days":
            return {
                from: startOfDayUtc(new Date(now.getTime() - 13 * DAY_MS)),
                to: endOfDayUtc(now),
            };
        case "last-30-days":
            return {
                from: startOfDayUtc(new Date(now.getTime() - 29 * DAY_MS)),
                to: endOfDayUtc(now),
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
