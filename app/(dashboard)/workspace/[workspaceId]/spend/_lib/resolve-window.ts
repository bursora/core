/**
 * resolveSpendWindow — parses optional `from`/`to` URL strings into a half-open
 * `{from, to}` window with sane defaults and bounds.
 *
 * Defaults: today as a full UTC day; `from` = today 00:00 UTC,
 * `to` = today 23:59:59.999 UTC. Matches the "Today" preset in the date
 * range picker (`components/workspace/filters/date-range-picker-logic.ts`)
 * so the URL/UI is identical whether the user clicked "Today" or got the
 * default. Day boundaries are UTC, the same frame ClickHouse buckets and
 * partitions in, so windows and chart buckets never disagree, and the
 * numbers don't shift with the host's timezone.
 *
 * Validation:
 *   - Strings must be ISO-parseable to a valid Date.
 *   - `from < to` is required; otherwise fall back to defaults.
 *   - Span is clamped to MAX_SPAN_DAYS to bound DB load.
 */

import { endOfDayUtc, startOfDayUtc } from "@/lib/budgeting/period";

const MAX_SPAN_MS = 365 * 24 * 60 * 60 * 1000;

export interface ResolveSpendWindowInput {
    readonly from?: string | undefined;
    readonly to?: string | undefined;
    readonly now: Date;
}

export interface ResolvedWindow {
    readonly from: Date;
    readonly to: Date;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

function parseIso(value: string | undefined): Date | null {
    if (typeof value !== "string" || value.length === 0) return null;
    if (!ISO_RE.test(value)) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function defaultWindow(now: Date): ResolvedWindow {
    return { from: startOfDayUtc(now), to: endOfDayUtc(now) };
}

export function resolveSpendWindow(input: ResolveSpendWindowInput): ResolvedWindow {
    const parsedFrom = parseIso(input.from);
    const parsedTo = parseIso(input.to);

    const to = parsedTo ?? endOfDayUtc(input.now);
    const from = parsedFrom ?? startOfDayUtc(to);

    if (from.getTime() >= to.getTime()) {
        return defaultWindow(input.now);
    }

    const span = to.getTime() - from.getTime();
    if (span > MAX_SPAN_MS) {
        return { from: new Date(to.getTime() - MAX_SPAN_MS), to };
    }

    return { from, to };
}
