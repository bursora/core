# Changelog

Notable changes to Bursora, newest first. Pre-launch; entries get versioned once we ship.

## [2026-06-04] - Pre-launch

- Wrap one AI client in a single line: OpenAI, Anthropic, and Google Gemini natively, Amazon Bedrock via its own wrapper, plus any OpenAI-compatible vendor (DeepSeek, Groq, xAI, Mistral, Together, Fireworks, Perplexity, Cerebras, DeepInfra, SambaNova, Nebius, Novita, OpenRouter, Vercel AI Gateway) by base URL. Vercel AI SDK is supported through middleware, covering text, embeddings, and images.
- Pre-call budget checks block any call that would breach a hard limit; actual tokens and cost are metered right after. Errored provider calls are recorded for visibility but never counted as spend.
- Budgets scope to workspace, customer, agent, or workflow over daily, weekly, or monthly windows, in block or alert-only mode.
- Live spend dashboard groups by customer, agent, workflow, or model, with status filters, a custom date range, and CSV export. Every time and date renders in your own timezone.
- Anomaly and spike alerts route to Slack, Discord, or email.
- Per-key rate limits and per-workspace spike protection stop runaway loops before they run up a bill; both are configurable and off by default on self-host.
- Model prices sync daily from the LiteLLM feed; per-workspace overrides cover negotiated rates. Cache writes price separately from cache reads (Anthropic 1-hour cache writes at 2x), batch-API usage at 50% off, and text-to-speech bills per character. Cost math keeps sub-cent precision.
- Guided onboarding: pick a plan, name a workspace, issue a key, and connect the SDK. API keys are encrypted at rest and can be revealed and copied again from the dashboard.
- Account-scoped billing: you subscribe before your first workspace, and one subscription covers every workspace you own. Invite teammates as owner or member, and sign in with a one-time code sent to your email.
- Export your data as JSON, or delete your account after a grace window. On cloud, deletion cancels your subscription.
- Admins get a system status page with live health for Postgres, ClickHouse, Redis, SMTP, and the scheduled jobs.
- Cloud is a flat $29/mo, billed monthly or annually (two months free on annual), with a 5M-events/month fair-use ceiling (alert-only past it); self-host is free under Apache 2.0.
