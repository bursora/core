// Per-render memo: serialize args to a single string so `React.cache` can
// dedupe distinct-but-equal object literals (it keys by argument identity).
// Outside an RSC render, `cache()` is identity - each call re-runs `fn`.

import { cache } from "react";

const DATE_SENTINEL = "__d";

export type RequestMemoCache = <R>(
    fn: (serialized: string) => Promise<R>,
) => (serialized: string) => Promise<R>;

/**
 * Wrap an async loader so callers within one RSC render share a result, even
 * when they pass distinct-but-equal object literals. `cacheImpl` defaults to
 * React's `cache`; tests pass a string-keyed memo to drive the dedup contract
 * (outside an RSC render `cache()` collapses to identity).
 */
export function withRequestMemo<Args extends readonly unknown[], R>(
    fn: (...args: Args) => Promise<R>,
    cacheImpl: RequestMemoCache = cache,
): (...args: Args) => Promise<R> {
    const memoized = cacheImpl(async (serialized: string): Promise<R> => {
        const args = JSON.parse(serialized, (_k, v) => {
            if (isDateSentinel(v)) return new Date(v[DATE_SENTINEL]);
            return v;
        }) as Args;
        return fn(...args);
    });
    return (...args: Args): Promise<R> => memoized(JSON.stringify(withDateSentinels(args)));
}

// Pre-walk Date instances into `{ __d: ms }` sentinels before JSON.stringify
// runs. The replacer parameter is too late - `Date.prototype.toJSON` fires
// first and the replacer would only ever see an ISO string, losing the type
// after a JSON.parse round-trip.
function withDateSentinels(value: unknown): unknown {
    if (value instanceof Date) return { [DATE_SENTINEL]: value.getTime() };
    if (Array.isArray(value)) return value.map(withDateSentinels);
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(value as object)) {
            out[k] = withDateSentinels((value as Record<string, unknown>)[k]);
        }
        return out;
    }
    return value;
}

function isDateSentinel(v: unknown): v is { __d: number } {
    if (!v || typeof v !== "object") return false;
    const keys = Object.keys(v as object);
    if (keys.length !== 1 || keys[0] !== DATE_SENTINEL) return false;
    return typeof (v as { __d: unknown }).__d === "number";
}
