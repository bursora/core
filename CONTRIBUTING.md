# Contributing to Bursora

Thanks for your interest. Patches, bug reports, and self-host feedback are all welcome.

## Dev setup

```bash
git clone https://github.com/bursora/core.git
cd core
bun install
```

Requires Bun >= 1.0. Copy `.env.example` to `.env` and fill the `__REPLACE_ME__` secrets. The app needs Postgres, Redis, and ClickHouse to boot; `docker compose up -d` brings up all three. The example `.env` already points `DATABASE_URL`, `REDIS_URL`, and `CLICKHOUSE_URL` at them (with a localhost variant noted for non-Docker dev). Then:

```bash
cp .env.example .env   # fill BETTER_AUTH_SECRET, BURSORA_API_KEY_PEPPER, BURSORA_KEY, Google OAuth
bun run db:migrate     # apply Postgres + ClickHouse migrations
bun run db:seed        # load development pricing rows
bun run dev            # Next dev server on :3000
```

## Run the checks

```bash
bun run typecheck    # next typegen && tsc --noEmit
bun run lint         # eslint
bun test             # test suite
bun run build:oss    # OSS production build, no EE billing
```

## Pull requests

- Branch off `main`. Keep the diff focused; one feature or fix per PR.
- Add or update tests for any behavior change.
- Match the existing TypeScript style; no new dependencies without discussion.
- No CLA. Apache 2.0 covers the contribution.

## License boundary

The project is Apache 2.0, except `lib/ee/`, which is source-available under `lib/ee/LICENSE` (Enterprise License). Don't import `@/lib/ee/*` outside the existing allowlist; the OSS build (`bun run build:oss`) excludes it. Contributions to `lib/ee/` fall under that license, not Apache 2.0.

## Bugs and feature requests

Open an issue at https://github.com/bursora/core/issues. Repro steps beat prose. For security issues, see SECURITY.md.
