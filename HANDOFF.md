# Handoff — Bursora ClickHouse migration

Date: 2026-06-02. Goal: move `usage_events` from Postgres to ClickHouse, with a Redis spend counter fronting budget enforcement. Status: complete, committed, pushed; not merged. Solo (the tracker used to build this) is local-only — everything needed is embedded below so this doc stands alone.

## Shipped — pushed to remotes (pick up on the other machine)

All three repos committed + pushed on branch `worktree-clickhouse`:

- superproject `bursora`: bumps core/site/sdk pointers → `origin/worktree-clickhouse`
- `core/`: feat: move usage_events to clickhouse, redis-counter enforcement (+ this handoff) → `origin/worktree-clickhouse`
- `site/`: docs: clickhouse + required redis in self-host → `origin/worktree-clickhouse`
- `sdk/` pointer bumped to `314fe42` (already on sdk remote; no sdk code change)

On the other machine:

```
git fetch origin && git checkout worktree-clickhouse
git submodule update --init --recursive        # lands core, site, sdk@314fe42
bun install                                     # superproject root — wires submodules
cp core/.env.example core/.env                  # fill: BURSORA_API_KEY_PEPPER, BETTER_AUTH_SECRET, CRON_SECRET, BURSORA_KEY (32-byte base64), REDIS_URL, CLICKHOUSE_URL
```

PRs not opened yet (3 needed: core, site, superproject). Nothing merged.

## What shipped (code — don't re-do)

- ClickHouse client `core/lib/clickhouse/` (client.ts, adapter.ts, config.ts); env `CLICKHOUSE_*` in `lib/env.ts`; `REDIS_URL` now **required**.
- Versioned CH migrations: `core/clickhouse/migrate.ts` (+ `--fresh`, `--ensure-db`), `core/clickhouse/migrations/0001_usage_events.sql`.
- `usage_events` CH table: MergeTree, `ORDER BY (workspace_id, ts)`, `cost_usd Decimal(22,8)`, facet skip-indexes, `TTL toDateTime(ts) + INTERVAL 90 DAY`.
- CH write repo + ingest rewire + Redis request-dedup (`lib/metering/request-dedup.ts`).
- CH read repos (`lib/metering/clickhouse-metering-read.repository.ts`, `lib/spend/clickhouse-spend.repository.ts`); spike + detection CH sources.
- Redis spend counter `lib/spend-counter/` — EXISTS-gated `INCRBYFLOAT`, reconcile-on-miss from CH, multi-scope fan-out. Budget hot path (`lib/budgeting/`) reads it instead of PG SUM.
- 5 extra PG readers migrated to CH, each with a live-CH contract test: budget `getBudgetStats`, `compose/spend-composition`, `compose/activity` fetchEventBuckets, `dashboard/dashboard-stats` count-between, `budgeting/blocked-calls` (fixture `core/tests/support/clickhouse-usage-events.ts`).
- Retention = CH TTL; PG prune cron + partition machinery deleted.
- PG `usage_events` dropped: `core/drizzle/migrations/0027_lush_ken_ellis.sql` (CASCADE). `usageEvents` Drizzle schema + event/metering-read/spend repos deleted. No PG event path remains.
- `db:migrate` / `db:fresh` / `db:setup` provision PG **and** CH (one command; CH idempotent — verified `nothing pending` on re-run).
- `core/docker-compose.yml`: lean — bursora/postgres/redis/clickhouse-server + dev-profiled `mailhog`. **No migrate service** (migrations run manually: `docker compose run --rm bursora bun run db:migrate`). docker-environment's mailhog folded in.
- Docs: `site/docs/get-started/self-host.md` + `site/docs/reference/environment.md`.

## Decisions & gotchas (embedded from the tracker)

- Storage-engine swap only; pricing/billing untouched. **No backfill** (fresh CH table) — any old PG event rows discarded.
- Idempotency at the app layer (Redis dedup), table is plain `MergeTree` (NOT ReplacingMergeTree).
- Spend counter is the enforcement source of truth; CH is analytics + the reconcile baseline. EXISTS-gated increment ⇒ cache loss can only over-count (errs toward blocking), never under-count. Counter is seeded by the budget preflight read.
- Recommend Redis `noeviction`/`volatile-ttl` so hot counters aren't evicted mid-window.
- Bucketing: `intDiv(toUnixTimestamp64Milli(ts), bucketMs)*bucketMs`. Do NOT use `toStartOfInterval` — it returns `DateTime`, breaks `toUnixTimestamp64Milli` (`ILLEGAL_TYPE_OF_ARGUMENT`). This was a real bug found + fixed.
- DDL gotchas (fixed): `TTL` must wrap `toDateTime(ts)` (CH 24.8 rejects a DateTime64 TTL); no literal `;` inside `--` comments (the migrate runner splits on `;` blind to comments).
- `REDIS_URL` is now always required → the self-host test fixture `tests/support/with-self-host-env.ts` must SET it, not delete it (fixed; was the one regression caught at ship).
- Compose: only services Bursora uses; migrate container dropped (user decision); run `bun run dev` on host.

## Verification status

- CH integration suite (live CH): **817 pass / 0 fail**; all 5 new contract tests pass.
- Full suite with real `.env` + CH unreachable (CH tests skip): **1940 pass / 65 skip / 0 fail**. Pre-commit hook (typecheck + lint + format + test) is green.
- `bun run build` + `bun run build:oss`: compile + typecheck clean; EE boundary holds (`core/scripts/verify-oss-build.sh` → no EE symbols). Build page-data exit-0 needs a real `BURSORA_KEY` + the sdk submodule at `314fe42` (now bumped) — both env, not code.

## Local test setup (to re-run the CH suite anywhere)

- ClickHouse for tests needs skip-user-setup:
  `docker run -d -p 18123:8123 -e CLICKHOUSE_SKIP_USER_SETUP=1 --ulimit nofile=262144:262144 clickhouse/clickhouse-server:24.8`
- `CLICKHOUSE_URL=http://localhost:18123 bun test <dirs>`. The harness (`tests/support/clickhouse-db.ts`) creates an ephemeral DB per run against that live server. CH integration tests SKIP when `CLICKHOUSE_URL` is unset.
- Run test dirs in small batches — many parallel runs against one CH wedge it (orphan test DBs + hung connections). If wedged, recreate the container.

## Open items / next steps

1. Open 3 PRs (core, site, superproject `worktree-clickhouse`).
2. After merge: drop `worktree-clickhouse` branches; on the build host set a real `BURSORA_KEY` so build page-data reaches exit-0.
3. `docker rm -f ch-verify` (test scaffold container, port 18123).
4. **Rotate** the `GITHUB_TOKEN` that was in `docker-environment/.env` (plaintext; exposed during the build session).

## Issue ledger (embedded — was tracker epic #136 + standalones)

Built as 13 vertical slices + 2 follow-ups. All complete.

1. CH client + env config
2. CH migration tooling (`db:ch-migrate`)
3. `usage_events` CH DDL (Decimal cost, skip-indexes, 90-day TTL)
4. CH integration test harness
5. CH write repo + ingest rewire + requestId dedup
6. CH read repos (metering-read + spend)
7. CH spike-baseline + detection sources
8. Redis spend counter (enforcement-critical)
9. Budget hot-path rewire → spend counter
10. Retention via CH TTL (delete PG prune/partition machinery)
11. docker-compose CH service + env; `REDIS_URL` required
12. Cutover: drop PG `usage_events`, migrate 5 stray readers + contract tests, delete Drizzle event schema/repos
13. Docs: self-host + environment reference

- Standalone A: consolidate docker-environment services into core compose (only mailhog kept)
- Standalone B: tie CH into the `db:*` chain + drop the compose migrate service

## PRD (embedded — was tracker scratchpad #96)

### Problem

`usage_events` is the highest-volume table; every dashboard view is a live GROUP BY over it. Monthly-partitioned Postgres works now but won't scale: wide-window analytics scan many rows, storage grows linearly, retention is a hand-rolled prune cron + partition juggling. The pattern is append-only, time-ordered, read as column aggregates over time + a few facets — textbook columnar store.

### Solution

Move `usage_events` to ClickHouse; keep everything else in Postgres. CH stores events (MergeTree, columnar, compressed, ordered by `(workspace_id, ts)`); retention is a native TTL. Budget enforcement never touches CH on the hot path — a Redis spend counter sits in front (increment per recorded event; budget check reads Redis sub-ms; on miss/rollover reconcile from CH). Dashboard reads, spike baseline, and detection cron read CH behind existing repository interfaces (adapter swap, use-cases unchanged). CH runs everywhere incl. self-host (compose service). `budgets`, `pricing`, `workspaces`, `api_keys`, event-bundle counter stay Postgres.

### Key implementation decisions

- Scope: only `usage_events` moves; `decided_by_budget_id` becomes a plain UUID column (no FK) in CH.
- Idempotency app-side (Redis dedup over the idempotency window), plain MergeTree — a ReplacingMergeTree would fight the analytical ORDER BY or collapse distinct null-requestId events. A duplicate slipping past Redis is one extra analytics row (bounded); enforcement unaffected (counter is source of truth).
- Cutover: hard switch on a fresh CH table, no backfill / no dual-write.
- `async_insert=1, wait_for_async_insert=0` so ingest never blocks on merges (tiny durability window; counter, not the CH row, is the enforcement truth).
- Spend counter: `INCRBYFLOAT spend:{workspace}:{scope}:{period}` for every scope an event rolls up to, TTL covers the window; reconcile-on-miss sums the matching CH window. Reconciliation is what keeps enforcement from silently failing open after a Redis flush.
- CH cost stored at full precision (`Decimal(22,8)`, no float) so totals match PG to the cent.

### Out of scope

Moving other tables to CH; backfilling history; dual-write/dual-read; new dashboard views/metrics; changing user-facing retention (still 90 days), pricing units, or SDK behavior; CH replication/clustering (single-node target).

### Testing approach

Assert external behavior: given recorded events, read adapters return the same shapes/totals the dashboard expects, and the counter blocks/allows on the same evidence a PG SUM would. Don't assert CH internals (part merges, async-insert timing). Unit tests use repository fakes; integration tests run real queries against a live CH in CI / local. Highest-risk module = the spend counter (increment-then-read, multi-scope fan-out, rollover, reconcile-on-miss matches a direct sum, dedup).
