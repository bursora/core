# app/api/v1

External SDK surface. Stable contract.

Route handlers here (`route.ts` under each segment) are the public HTTP API consumed by `@bursora/sdk` and third-party callers. Treat the request/response shapes as a versioned contract; breaking changes mean a new `v2`.

## Split: route handler vs server action

- `app/api/v1/*/route.ts` — external HTTP endpoints. Auth via API key. Anything a third party can call lives here.
- `actions.ts` files under `app/(dashboard)/**` — internal server actions. Auth via session. Only the dashboard UI calls them.

## Picker

If a third party (SDK, customer script, webhook consumer) needs it, it's a route handler under `app/api/v1/`.

If only the dashboard UI calls it, it's a server action colocated with the route folder.

When in doubt: server action. Promoting to a route handler later is cheap; ripping a half-baked endpoint out of a public contract is not.

## Current handlers

- `GET /api/v1/budget` — budget status
- `GET /api/v1/activity` — usage rows
- `POST /api/v1/events` — ingest usage events
- `/api/v1/test` — connectivity check
