# Changelog

Notable changes to Bursora, newest first. Pre-launch; entries get versioned once we ship.

## [2026-05-30] - Pre-launch

- Wrap one AI client in a single line: OpenAI, Anthropic, and Google Gemini natively, plus any OpenAI-compatible vendor (DeepSeek, Groq, xAI, Mistral, and more) by base URL. Vercel AI SDK supported through middleware.
- Pre-call budget checks block any call that would breach a hard limit; actual tokens and cost are metered right after.
- Budgets scope to workspace, customer, agent, or workflow over daily, weekly, or monthly windows, in block or alert-only mode.
- Live spend dashboard groups by customer, agent, workflow, or model, with status and date filters plus CSV export.
- Anomaly and spike alerts route to Slack, Discord, or email.
- Model prices sync daily from the LiteLLM feed; per-workspace overrides cover negotiated rates. Cost math keeps sub-cent precision.
- Cloud is a flat $29/mo with a 5M-events/month fair-use ceiling (alert-only past it); self-host is free under Apache 2.0.
