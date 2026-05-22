# Changelog

All notable changes to Bursora are recorded here. Newest first.

## [2026-05-19] — Legal pages, group-by facet, sub-cent precision

- Privacy and Terms pages live under the landing chrome.
- Spend dashboard adds a group-by facet so you can slice by customer, agent, workflow, or model in one click.
- Cost math keeps sub-cent precision end to end; rounding only at the display layer.
- Project renamed from Bursar to Bursora across the codebase.

## [2026-05-18] — Unified workspace banner and blocked-call attribution

- One banner pipeline for setup hints, plan limits, and alerts; no more stacking surfaces.
- Budget detail page shows which customer, agent, or workflow tripped the limit.
- Notifications now route through a single channel so Slack and Discord stay in sync.

## [2026-05-17] — Live data refresh on the dashboard

- Spend view refreshes on a configurable interval; no more manual reloads.
- Status filter on /spend separates allowed, blocked, and errored calls.
- Per-budget detail page surfaces recent activity inline.
