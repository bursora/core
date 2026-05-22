// In-memory parity for `MeteringReadRepository`. Cost math uses bigint scaled
// to 1e8 to match `numeric(14,8)` deterministically.

import {
    decodeBlockedEventsCursor,
    encodeBlockedEventsCursor,
    type BlockedEventRow,
    type BlockedEventsForBudgetQuery,
    type BlockedEventsPage,
    type CountBlockedEventsForBudgetQuery,
    type CountEventsQuery,
    type CumulativeSpendDailyQuery,
    type DistinctValueWithCount,
    type DistinctValuesByScope,
    type Facet,
    type LastUsageEventAtQuery,
    type ListDistinctValuesBulkQuery,
    type MeteringFilters,
    type MeteringReadRepository,
    type MeteringStatusFilter,
    type ScopeKind,
    type SeriesPoint,
    type SpendSeriesQuery,
    type TopSpenderRow,
    type TopSpendersQuery,
    type UsageEventRow,
} from "@/lib/metering";

const SCALE = 100_000_000n; // 1e8 → numeric(14,8)
const DAY_MS = 24 * 60 * 60 * 1000;

const scopeValue = (scope: ScopeKind, row: UsageEventRow): string | null => {
    switch (scope) {
        case "tenant":
            return row.tenantId;
        case "agent":
            return row.agentId;
        case "workflow":
            return row.workflowId;
        case "provider":
            return row.provider;
        case "model":
            return row.model;
    }
};

const facetValue = (facet: Facet, row: UsageEventRow): string | null => {
    switch (facet) {
        case "tenant":
            return row.tenantId;
        case "agent":
            return row.agentId;
        case "workflow":
            return row.workflowId;
        case "model":
            return row.model;
    }
};

const toScaled = (s: string): bigint => {
    const [whole, frac = ""] = s.split(".");
    const padded = (frac + "00000000").slice(0, 8);
    const sign = whole?.startsWith("-") ? -1n : 1n;
    const wholeAbs = (whole ?? "0").replace("-", "");
    return sign * (BigInt(wholeAbs) * SCALE + BigInt(padded));
};

const fromScaled = (n: bigint): string => {
    const sign = n < 0n ? "-" : "";
    const abs = n < 0n ? -n : n;
    const whole = abs / SCALE;
    const frac = abs % SCALE;
    return `${sign}${whole.toString()}.${frac.toString().padStart(8, "0")}`;
};

/**
 * Floor `ts` to the start of the bucket that contains it. Buckets are aligned
 * to UTC epoch boundaries — same semantics as Postgres
 * `date_trunc('hour'|'minute'|'day', ts)` for the sizes we use:
 *   - 300s (5min) → minute aligned to 5-minute boundary
 *   - 3600s (1h)  → start of hour
 *   - 86400s (1d) → start of UTC day
 */
const bucketStart = (ts: Date, bucketSeconds: number): Date => {
    const sizeMs = bucketSeconds * 1000;
    const k = Math.floor(ts.getTime() / sizeMs);
    return new Date(k * sizeMs);
};

/**
 * Mirrors `statusFilter` in the Drizzle repository: rows match when the
 * filter is `'both'`, when it matches `row.status`, or when omitted/undefined
 * and the row is `'ok'` (status defaults to `'ok'` for rows persisted without
 * an explicit value).
 */
const matchesStatus = (row: UsageEventRow, status: MeteringStatusFilter | undefined): boolean => {
    const effective = status ?? "ok";
    if (effective === "both") return true;
    return (row.status ?? "ok") === effective;
};

const distinctForScope = (
    rows: readonly UsageEventRow[],
    workspaceId: string,
    scope: ScopeKind,
    since: Date,
    limit: number,
    status: MeteringStatusFilter | undefined,
): readonly DistinctValueWithCount[] => {
    const counts = new Map<string, number>();
    for (const row of rows) {
        if (row.workspaceId !== workspaceId) continue;
        if (row.ts < since) continue;
        if (!matchesStatus(row, status)) continue;
        const v = scopeValue(scope, row);
        if (v === null) continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => {
        if (a[1] !== b[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
    });
    return sorted.slice(0, limit).map(([value, count]) => ({ value, count }));
};

// Each persisted row gets a stable synthetic id so cursor pagination can
// tiebreak rows that share a timestamp. Postgres compares `uuid` byte-wise
// on the canonical 16-byte form; production uses `gen_random_uuid()` (v4),
// so tiebreaker order is deterministic but unrelated to insertion order.
// The fake's zero-padded numeric ids give the same deterministic order;
// the comparison shape (compound `(ts, id)` strictly less than) matches.
interface StoredEvent {
    readonly id: string;
    readonly row: UsageEventRow;
}

export class InMemoryMeteringReadRepository implements MeteringReadRepository {
    private readonly stored: StoredEvent[] = [];
    private nextId = 1;

    get rows(): readonly UsageEventRow[] {
        return this.stored.map((s) => s.row);
    }

    add(row: UsageEventRow): void {
        // Zero-padded so plain lexicographic compare matches insertion order,
        // mirroring how UUID v7 timestamps compare in Postgres.
        const id = String(this.nextId++).padStart(16, "0");
        this.stored.push({ id, row });
    }

    private matchesMeteringFilters(row: UsageEventRow, q: MeteringFilters): boolean {
        const inList = (arr: readonly string[] | undefined, val: string | null): boolean =>
            arr === undefined || arr.length === 0 || (val !== null && arr.includes(val));
        if (!inList(q.provider, row.provider)) return false;
        if (!inList(q.tenantId, row.tenantId)) return false;
        if (!inList(q.agentId, row.agentId)) return false;
        if (!inList(q.workflowId, row.workflowId)) return false;
        if (!inList(q.model, row.model)) return false;
        return true;
    }

    async spendSeries(query: SpendSeriesQuery): Promise<readonly SeriesPoint[]> {
        const groups = new Map<
            string,
            { bucket: Date; tag: string | null; sum: bigint; callCount: number }
        >();

        for (const row of this.rows) {
            if (row.workspaceId !== query.workspaceId) continue;
            if (row.ts < query.windowStart) continue;
            if (row.ts >= query.windowEnd) continue;
            if (!matchesStatus(row, query.status)) continue;

            const tag = facetValue(query.facet, row);
            if (query.scopeId !== undefined && tag !== query.scopeId) continue;
            if (!this.matchesMeteringFilters(row, query)) continue;
            const bucket = bucketStart(row.ts, query.bucketSeconds);
            const key = `${bucket.toISOString()}|${tag ?? ""}`;

            const existing = groups.get(key);
            const cost = toScaled(row.costUsd);
            if (existing === undefined) {
                groups.set(key, { bucket, tag, sum: cost, callCount: 1 });
            } else {
                existing.sum += cost;
                existing.callCount += 1;
            }
        }

        const points: SeriesPoint[] = [];
        for (const { bucket, tag, sum, callCount } of groups.values()) {
            points.push({
                bucket,
                tag: tag ?? "(untagged)",
                costUsd: fromScaled(sum),
                callCount,
            });
        }

        points.sort((a, b) => {
            const t = a.bucket.getTime() - b.bucket.getTime();
            if (t !== 0) return t;
            return a.tag.localeCompare(b.tag);
        });

        return points;
    }

    async topSpenders(query: TopSpendersQuery): Promise<readonly TopSpenderRow[]> {
        const sums = new Map<
            string,
            { tag: string | null; sum: bigint; callCount: number; blockedCount: number }
        >();

        for (const row of this.rows) {
            if (row.workspaceId !== query.workspaceId) continue;
            if (row.ts < query.windowStart) continue;
            if (row.ts >= query.windowEnd) continue;

            const tag = facetValue(query.facet, row);
            if (query.scopeId !== undefined && tag !== query.scopeId) continue;
            if (!this.matchesMeteringFilters(row, query)) continue;

            const key = tag ?? "__untagged__";
            const rowStatus: "ok" | "blocked" = row.status ?? "ok";
            const isBlocked = rowStatus === "blocked";

            // `blockedCount` is computed unconditionally so the dashboard can
            // show it next to cost. The query's `status` filter gates only
            // which rows feed `callCount` / `costUsd`.
            const passesStatusFilter = matchesStatus(row, query.status);

            let existing = sums.get(key);
            if (existing === undefined) {
                existing = { tag, sum: 0n, callCount: 0, blockedCount: 0 };
                sums.set(key, existing);
            }
            if (isBlocked) existing.blockedCount += 1;
            if (passesStatusFilter) {
                existing.sum += toScaled(row.costUsd);
                existing.callCount += 1;
            }
        }

        const out: TopSpenderRow[] = [];
        const effective = query.status ?? "ok";
        for (const { tag, sum, callCount, blockedCount } of sums.values()) {
            // Drop tags with zero rows under the requested status filter —
            // mirrors the Drizzle HAVING clause. `'both'` keeps everything.
            if (effective !== "both" && callCount === 0) continue;
            out.push({ tag, costUsd: fromScaled(sum), callCount, blockedCount });
        }

        out.sort((a, b) => {
            const av = toScaled(a.costUsd);
            const bv = toScaled(b.costUsd);
            if (av === bv) return 0;
            return av < bv ? 1 : -1;
        });

        return out.slice(0, query.limit);
    }

    async listDistinctValuesBulk(
        query: ListDistinctValuesBulkQuery,
    ): Promise<DistinctValuesByScope> {
        const since = new Date(query.now.getTime() - query.sinceDays * DAY_MS);
        const result: { [K in ScopeKind]?: readonly DistinctValueWithCount[] } = {};
        for (const scope of query.scopes) {
            result[scope] = distinctForScope(
                this.rows,
                query.workspaceId,
                scope,
                since,
                query.limit,
                query.status,
            );
        }
        return result;
    }

    async countEvents(query: CountEventsQuery): Promise<number> {
        let count = 0;
        for (const row of this.rows) {
            if (row.workspaceId !== query.workspaceId) continue;
            if (query.since !== undefined && row.ts < query.since) continue;
            if (!matchesStatus(row, query.status)) continue;
            if (!this.matchesMeteringFilters(row, query)) continue;
            count++;
        }
        return count;
    }

    async getLastUsageEventAt(query: LastUsageEventAtQuery): Promise<Date | null> {
        let latest: Date | null = null;
        for (const row of this.rows) {
            if (row.workspaceId !== query.workspaceId) continue;
            if (latest === null || row.ts > latest) latest = row.ts;
        }
        return latest;
    }

    async listBlockedEventsForBudget(
        query: BlockedEventsForBudgetQuery,
    ): Promise<BlockedEventsPage> {
        interface MatchedRow {
            readonly id: string;
            readonly row: BlockedEventRow;
        }
        const decoded = decodeBlockedEventsCursor(query.cursor);
        const matching: MatchedRow[] = [];
        for (const { id, row } of this.stored) {
            if (!this.matchesBlockedForBudget(row, query)) continue;
            if (decoded !== null && !beforeCursor(row.ts, id, decoded)) continue;
            const intendedModel = (row.status ?? "ok") === "blocked" ? (row.model ?? null) : null;
            matching.push({
                id,
                row: {
                    ts: row.ts.toISOString(),
                    tenantId: row.tenantId,
                    agentId: row.agentId,
                    workflowId: row.workflowId,
                    intendedProvider:
                        (row.status ?? "ok") === "blocked" ? (row.provider ?? null) : null,
                    intendedModel,
                    blockReason: row.blockReason ?? null,
                },
            });
        }

        // Page order `(ts DESC, id DESC)` — same shape the Drizzle adapter
        // emits. The id tiebreaker keeps rows in a same-millisecond burst
        // addressable across page boundaries.
        matching.sort((a, b) => {
            const t = b.row.ts.localeCompare(a.row.ts);
            if (t !== 0) return t;
            return b.id.localeCompare(a.id);
        });

        if (matching.length <= query.limit) {
            return { items: matching.map((m) => m.row), nextCursor: null };
        }
        const page = matching.slice(0, query.limit);
        const last = page[page.length - 1];
        return {
            items: page.map((m) => m.row),
            nextCursor: last ? encodeBlockedEventsCursor({ ts: last.row.ts, id: last.id }) : null,
        };
    }

    async countBlockedEventsForBudget(query: CountBlockedEventsForBudgetQuery): Promise<number> {
        let count = 0;
        for (const row of this.rows) {
            if (this.matchesBlockedForBudget(row, query)) count++;
        }
        return count;
    }

    async cumulativeSpendDaily(query: CumulativeSpendDailyQuery): Promise<readonly number[]> {
        const fromMs = query.from.getTime();
        const toMs = query.to.getTime();
        const span = toMs - fromMs;
        if (!Number.isFinite(span) || span <= 0) return [];

        const dayCount = Math.max(1, Math.ceil(span / DAY_MS));
        const perDay = new Array<bigint>(dayCount).fill(0n);

        for (const row of this.rows) {
            if (row.workspaceId !== query.workspaceId) continue;
            if ((row.status ?? "ok") !== "ok") continue;
            const ts = row.ts.getTime();
            if (ts < fromMs || ts >= toMs) continue;
            if (!matchesScope(row, query)) continue;
            const idx = Math.floor((ts - fromMs) / DAY_MS);
            if (idx < 0 || idx >= dayCount) continue;
            perDay[idx] = (perDay[idx] ?? 0n) + toScaled(row.costUsd);
        }

        let running = 0n;
        return perDay.map((d) => {
            running += d;
            return Number(running) / Number(SCALE);
        });
    }

    private matchesBlockedForBudget(
        row: UsageEventRow,
        query: { workspaceId: string; budgetId: string; from: Date; to: Date },
    ): boolean {
        if (row.workspaceId !== query.workspaceId) return false;
        if ((row.status ?? "ok") !== "blocked") return false;
        if ((row.decidedByBudgetId ?? null) !== query.budgetId) return false;
        if (row.ts < query.from) return false;
        if (row.ts >= query.to) return false;
        return true;
    }
}

const matchesScope = (row: UsageEventRow, query: CumulativeSpendDailyQuery): boolean => {
    if (query.scopeType === "workspace") return true;
    if (query.scopeId === null) return true;
    switch (query.scopeType) {
        case "tenant":
            return row.tenantId === query.scopeId;
        case "agent":
            return row.agentId === query.scopeId;
        case "workflow":
            return row.workflowId === query.scopeId;
    }
};

/**
 * `(ts, id)` strictly before `cursor` under the page order
 * `(ts DESC, id DESC)`. Mirrors `or(lt(ts, cursor.ts), and(eq(ts, cursor.ts),
 * lt(id, cursor.id)))` in SQL.
 */
const beforeCursor = (ts: Date, id: string, cursor: { ts: string; id: string }): boolean => {
    const t = ts.toISOString();
    if (t < cursor.ts) return true;
    if (t > cursor.ts) return false;
    return id < cursor.id;
};
