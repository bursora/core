# Handoff — Bursora ClickHouse migration (epic #136)

Date: 2026-06-02. Project: bursora (Solo project 12). Goal: move `usage_events` from Postgres to ClickHouse, with a Redis spend counter fronting budget enforcement. **Status: all work DONE, but NOT committed/pushed** — see the blocker below before continuing on another machine.

## Shipped — pushed to remotes (pick up on the other machine)

All three repos committed + pushed on branch `worktree-clickhouse`:

- superproject `bursora`: `b922f54` (bumps core/site/sdk pointers) → `origin/worktree-clickhouse`
- `core/`: `9dd6ded` (99 files, +7709/−2995) → `origin/worktree-clickhouse`
- `site/`: `66c59c6` (2 docs) → `origin/worktree-clickhouse`
- `sdk/` pointer bumped to `314fe42` (already on sdk remote; no sdk code change)

On the other machine:

```
git clone --recurse-submodules <bursora superproject>   # or in an existing clone:
git fetch origin && git checkout worktree-clickhouse
git submodule update --init --recursive        # lands core@9dd6ded, site@66c59c6, sdk@314fe42
bun install                                     # superproject root — wires submodules
cp core/.env.example core/.env                  # then fill secrets (BURSORA_API_KEY_PEPPER, BETTER_AUTH_SECRET, CRON_SECRET, BURSORA_KEY 32-byte, REDIS_URL, CLICKHOUSE_URL)
```

PRs not opened yet (3 needed: core, site, superproject). Nothing merged.

## What shipped (don't re-do)

Epic #136 = 13 child issues, all complete, plus 2 standalone follow-ups. Full per-issue detail + worker summaries live in Solo (see References). High level:

- ClickHouse client `core/lib/clickhouse/` (client.ts + adapter.ts + config.ts); env `CLICKHOUSE_*` in `lib/env.ts`; `REDIS_URL` now **required**.
- Versioned CH migrations: `core/clickhouse/migrate.ts` (+ `--fresh`, `--ensure-db`), `core/clickhouse/migrations/0001_usage_events.sql`.
- `usage_events` CH table: MergeTree, `ORDER BY (workspace_id, ts)`, `cost_usd Decimal(22,8)`, facet skip-indexes, `TTL toDateTime(ts) + INTERVAL 90 DAY`.
- CH write repo + ingest rewire + Redis request-dedup (`lib/metering/request-dedup.ts`).
- CH read repos (`lib/metering/clickhouse-metering-read.repository.ts`, `lib/spend/clickhouse-spend.repository.ts`); spike + detection CH sources.
- Redis spend counter `lib/spend-counter/` — EXISTS-gated `INCRBYFLOAT`, reconcile-on-miss from CH, multi-scope fan-out. Budget hot path (`lib/budgeting/`) reads it instead of PG SUM.
- 5 stray PG readers migrated to CH (budget getBudgetStats, compose/spend-composition, compose/activity, dashboard-stats count-between, budgeting/blocked-calls) — each with a live-CH contract test (`core/tests/support/clickhouse-usage-events.ts` fixture + 5 test files).
- Retention = CH TTL; PG prune cron + partition machinery deleted.
- Cutover: PG `usage_events` dropped via `core/drizzle/migrations/0027_lush_ken_ellis.sql` (CASCADE); `usageEvents` Drizzle schema + event/metering-read/spend repos deleted. No PG event path remains.
- `db:migrate` / `db:fresh` provision PG **and** CH (one command).
- `core/docker-compose.yml`: lean — bursora/postgres/redis/clickhouse-server + dev-profiled `mailhog`. **No migrate service** (migrations run manually). Brings the user's previously-separate `docker-environment` mailhog into this repo.
- Docs: `site/docs/get-started/self-host.md` + `site/docs/reference/environment.md` (CH required, `CLICKHOUSE_URL`, required `REDIS_URL`, manual migrate step).

## Key decisions made this session

- Pricing/billing unrelated; this is a storage-engine swap. No backfill (fresh CH table).
- Idempotency at app layer (Redis dedup), plain MergeTree — not ReplacingMergeTree.
- Spend counter is the enforcement source of truth; CH is analytics + reconcile baseline. EXISTS-gated increment ⇒ cache loss can only over-count (errs toward blocking), never under-count.
- Bucketing uses `intDiv(toUnixTimestamp64Milli(ts), bucketMs)*bucketMs` — NOT `toStartOfInterval` (that returns DateTime, breaks `toUnixTimestamp64Milli`; was a real bug caught + fixed).
- docker-compose: only services Bursora uses; migrate container dropped (user decision); `bun run dev` on host.
- Verification gate before the destructive PG drop ("verify-first") — caught 2 CH query bugs + the 5 unmigrated readers.

## Verification status

- CH integration suite (live CH): **817 pass / 0 fail** across batches; all 5 new contract tests pass.
- `bun run typecheck` + `bun run lint`: clean.
- `bun run build` + `bun run build:oss`: compile + typecheck clean; EE boundary holds (`core/scripts/verify-oss-build.sh` → no EE symbols in OSS bundle).
- Known NON-blocking gaps in THIS worktree only (not code defects): build page-data collection can't reach exit-0 because (a) placeholder `BURSORA_KEY` (needs a real 32-byte key inline) and (b) the `sdk/` submodule predates `sdk/examples/google-quickstart.ts` which `lib/onboarding/snippets.ts` reads at build time. Re-verify on the other machine after `bun install` at superproject root (wires sdk) + a real `.env`.

## Environment / containers on this machine

- Live CH for tests: container `ch-verify` on `localhost:18123` (started with `-e CLICKHOUSE_SKIP_USER_SETUP=1`). This was a verification scaffold only — safe to `docker rm -f ch-verify`. The real CH is the compose `clickhouse-server`.
- `core-mailhog-1` running (the compose dev mailhog; replaced docker-environment's).
- To run the CH suite elsewhere: start a CH (`docker run -d -p 18123:8123 -e CLICKHOUSE_SKIP_USER_SETUP=1 --ulimit nofile=262144:262144 clickhouse/clickhouse-server:24.8`), then `CLICKHOUSE_URL=http://localhost:18123 bun test <dirs>` in core. The harness creates ephemeral per-run databases; run dirs in small batches — hammering one CH with many parallel runs wedges it.

## Security note (action needed)

`docker-environment/.env` contains a live `GITHUB_TOKEN` in plaintext (value redacted here). It was read during this session — **rotate it**. It was NOT copied into any committed file; compose references it as `${GITHUB_TOKEN}` only.

## Open items / next steps

1. **Commit + push** core + site + superproject `worktree-clickhouse` branches (prereq for the other machine).
2. Optionally run a formal review over the diff before committing.
3. On the other machine: `bun install` at superproject root, create `core/.env` from `core/.env.example` (set `BURSORA_API_KEY_PEPPER`, `BETTER_AUTH_SECRET`, `CRON_SECRET`, a real `BURSORA_KEY`, `CLICKHOUSE_URL`, `REDIS_URL`), then re-run typecheck/lint/build + CH suite to confirm green in a full env.
4. Solo board (#136 + children, scratchpads) intentionally left intact — cleanup is a post-ship step, only after merged.

## Suggested skills (next session)

- `review` or `/code-review` — multi-lens review of the worktree diff before commit (large changeset, touches enforcement + a destructive migration).
- `ship` — validate + commit + push the branches (run for superproject and each submodule, or commit submodules first then the pointer bump).
- `pr` — open the PR once pushed.
- `using-solo` / `execute` — only if new follow-up work appears; the epic itself is drained.

## References (source of truth — don't duplicate here)

- Solo epic: `#136` → `solo://proj/12/todo/epic-move-usage-even--136`
- PRD scratchpad: `#96` → `solo://proj/12/scratchpad/move-usage-events-to--96`
- Child issues `#138`–`#150` (each has worker self-report comments, incl. the cutover summary on `#149` comment 33).
- Standalone: `#154` (compose consolidation), `#155` (db chain ties CH).
- Project conventions: `core/CLAUDE.md` (build modes, lib/ee boundary, docs rules).
- The actual change set: `git -C <worktree>/core diff HEAD` and `git -C <worktree>/site diff HEAD` (branch `worktree-clickhouse`).
