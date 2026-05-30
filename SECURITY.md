# Security Policy

## Reporting a vulnerability

Don't open a public issue for security problems.

Report privately through GitHub: the **Security** tab, then **Report a vulnerability** (https://github.com/bursora/core/security/advisories/new). The advisory stays private to the maintainers. You can also email security@bursora.com.

Include a repro or proof of concept where you can. We aim to acknowledge within 72 hours and to ship a fix or mitigation before public disclosure.

## What we care about most

Bursora blocks AI spend before a provider call goes out, so the sharp edges are:

- Auth bypass on the dashboard or API.
- Budget-check bypass: a call getting through when it should have been blocked.
- Tenant isolation breaks, where one workspace reads or affects another's data.
- Leaking API keys, tokens, or usage data.

## Supported versions

Only the latest `main` is supported. Fixes ship there first.
