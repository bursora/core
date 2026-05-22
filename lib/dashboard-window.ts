// Dashboard window: maps `?window=today|week|month` to a calendar-anchored
// UTC `[from, to)` slice plus the equal-length prior slice for KPI deltas.
// Pure - caller passes `now`. For `month`, prior is the same-length window
// immediately before `from`, NOT the previous calendar month.

const DAY_MS = 24 * 60 * 60 * 1000;

export type WindowKey = "today" | "week" | "month";

export interface DashboardWindow {
    readonly key: WindowKey;
    readonly from: Date;
    readonly to: Date;
    readonly priorFrom: Date;
    readonly priorTo: Date;
    readonly label: string;
}

export const DEFAULT_WINDOW_KEY: WindowKey = "today";

export function parseWindowKey(raw: string | string[] | undefined): WindowKey {
    return raw === "today" || raw === "week" || raw === "month" ? raw : DEFAULT_WINDOW_KEY;
}

function startOfUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcMondayWeek(d: Date): Date {
    // ISO week: Monday = 1, Sunday = 7. `getUTCDay()` returns 0 for Sunday.
    const dayOfWeek = d.getUTCDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    return new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday),
    );
}

function startOfUtcMonth(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function resolveWindow(key: WindowKey, now: Date): DashboardWindow {
    if (key === "today") {
        const from = startOfUtcDay(now);
        const priorFrom = new Date(from.getTime() - DAY_MS);
        return {
            key,
            from,
            to: now,
            priorFrom,
            priorTo: from,
            label: "Today",
        };
    }
    if (key === "week") {
        const from = startOfUtcMondayWeek(now);
        const priorFrom = new Date(from.getTime() - 7 * DAY_MS);
        return {
            key,
            from,
            to: now,
            priorFrom,
            priorTo: from,
            label: "Week",
        };
    }
    // month: prior is the same-length slice immediately before from.
    const from = startOfUtcMonth(now);
    const length = now.getTime() - from.getTime();
    return {
        key,
        from,
        to: now,
        priorFrom: new Date(from.getTime() - length),
        priorTo: from,
        label: "Month",
    };
}
