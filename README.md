# Bursora

Next.js 16 app (App Router + Turbopack) for the Bursora dashboard on `app.bursora.com`. Also publishes the `@bursora/core` package: shared UI primitives and pure helpers consumed by the sibling `site/` marketing app.

## Layout

```
app/
  (dashboard)/   # app.bursora.com surface — workspace, profile, alerts, budgets, etc.
  login/, invite/
  api/           # v1, auth, internal, cron, webhooks
components/
  ui/            # shadcn primitives + dashboard-views, workspace, brand, filters, hooks, shell subdirs
  shell/         # dashboard chrome (app-shell, sidebar-nav, user-menu, command-palette, ...)
lib/
  ee/            # source-available Enterprise module (Lemon Squeezy billing). See lib/ee/LICENSE.
  db/            # drizzle schema + client
  budgeting/, metering/, identity/, notification/, rate-limit/, spike-protection/, event-bundle/, detection/, plans/, ...
drizzle/         # migrations + seed/setup scripts
tests/           # all tests (audits, unit, integration, billing fakes, ...)
public/
```

Product docs live in the sibling `site/docs/` (rendered at bursora.com/docs).

## Run

- `bun install`
- `bun run dev` — start Next dev server on port 3000.
- `bun run typecheck` — `next typegen && tsc --noEmit`.
- `bun run lint` — `eslint .`.
- `bun test` — run the test suite.

## Database

- `bun run db:generate` — emit a migration from schema diff.
- `bun run db:migrate` — apply pending migrations.
- `bun run db:seed` — load development pricing rows.
- `bun run db:reset` — drop, migrate, seed.

## Builds

- `bun run build` — Turbopack production build with EE billing wired in.
- `bun run build:oss` — `OSS_BUILD=true next build`. The EE module is dropped via runtime guards (`process.env.OSS_BUILD === "true"`) and dynamic-import branches, so `lib/ee/` symbols don't land in the bundle.

## Boundaries

`bursora/lib/ee/` is source-available, not Apache 2.0. Only an allowlist of callers may import `@/lib/ee/*` (enforced by ESLint `no-restricted-imports`): the settings page, the Lemon Squeezy webhook route, the billing-webhook-prune cron route, EE-scoped tests, and code inside `lib/ee/`.

## Community edition (self-host)

The Apache 2.0 portion (everything outside `lib/ee/`) is the community edition you self-host. Run `bun run build:oss` for a build without the billing module. Community-supported, no SLA. See [`docs/get-started/self-host.md`](docs/get-started/self-host.md).

## License

Apache 2.0 for everything except `lib/ee/`. [`lib/ee/LICENSE`](lib/ee/LICENSE) governs the Enterprise module: free for development and evaluation; production use requires a Bursora Cloud subscription or signed commercial agreement.
