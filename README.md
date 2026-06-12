# Bursora

[![license](https://img.shields.io/badge/license-Apache--2.0-2563eb?style=flat-square)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-000?style=flat-square)](https://nextjs.org)
[![docs](https://img.shields.io/badge/docs-bursora.com-7c3aed?style=flat-square)](https://bursora.com/docs)

**A budget that says no before the AI call goes out.** This repo is the dashboard and API behind `app.bursora.com`, and the thing you self-host if you'd rather run it yourself.

Bursora sits between your app and the AI provider. Before each call, it checks the budget; over a limit, it blocks; under, the call goes through and Bursora records what it cost. You get live spend grouped by customer, agent, workflow, and model, plus hard limits, alerts, and a kill switch. The SDK wrap is [one line](https://github.com/bursora/sdk); nothing routes through us.

![Bursora dashboard: live spend per customer, a budget filling to its $50 cap, then a blocked call where the SDK throws BudgetExceededError before the provider request goes out](./.github/dashboard-demo.gif)

The full product story, in plain English, is at **[bursora.com/docs](https://bursora.com/docs)**. This README is for people running or hacking on the code.

No proxy. Your app still talks straight to the provider; the SDK just asks Bursora for a yes/no first, then reports the cost after.

```
your code  ──►  wrap(provider)  ──►  OpenAI / Anthropic / Google / DeepSeek
                     │
                     ├─► GET  /api/v1/budget   (pre-call, cached 60s)
                     └─► POST /api/v1/events   (post-call, batched)
```

## Self-host

Everything outside `lib/ee/` is Apache 2.0; that's the community edition. Bring your own Postgres, run the OSS build, and you have the whole product minus the managed billing. No feature gates, no SLA.

```bash
bun install
bun run build:oss   # production build without the EE billing module
```

Full walkthrough (env, Postgres + ClickHouse, first workspace): **[bursora.com/docs/get-started/self-host](https://bursora.com/docs/get-started/self-host)**.

## Develop

```bash
bun install
bun run dev         # Next dev server on :3000
bun run typecheck   # next typegen && tsc --noEmit
bun run lint
bun test
```

Database:

```bash
bun run db:migrate  # apply migrations (Postgres + ClickHouse)
bun run db:seed     # development pricing rows
bun run db:reset    # setup, migrate, seed from scratch
```

## How it's laid out

```
app/
  (dashboard)/   workspace, spend, budgets, alerts, profile
  api/           v1, auth, internal, cron, webhooks
components/
  ui/            shadcn primitives + dashboard views, filters, shell
  shell/         dashboard chrome (sidebar, command palette, ...)
lib/
  budgeting/ metering/ pricing/ notification/ rate-limit/ ...   the engine
  ee/          source-available Enterprise module (billing); see lib/ee/LICENSE
  db/          drizzle schema + client
drizzle/         migrations + seed
tests/           audits, unit, integration
```

Stack: Next.js 16 (App Router + Turbopack), Drizzle on Postgres, ClickHouse for usage events, better-auth. Product docs (concepts, SDK, recipes) live in the sibling `site/` repo and render at bursora.com/docs.

## The EE boundary

`lib/ee/` is source-available, not Apache 2.0. You can read it; production use needs a Bursora Cloud subscription or a commercial agreement, and you can't build a competing service on it. Everything else stays Apache 2.0.

The OSS build drops it entirely; runtime guards plus dynamic imports keep `lib/ee/` symbols out of the bundle, and only an allowlist of callers may import it (ESLint-enforced). `scripts/verify-oss-build.sh` proves it by grepping the built output.

## License

Apache 2.0, except `lib/ee/`, which is governed by [`lib/ee/LICENSE`](lib/ee/LICENSE): free to develop and evaluate, production needs Cloud or a commercial deal.
