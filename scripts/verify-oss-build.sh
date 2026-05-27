#!/usr/bin/env bash
#
# Verify the OSS build excludes lib/ee/ code from the runtime bundle.
#
# Runs `OSS_BUILD=true bun next build` (caller must export required env vars
# or pass them inline), then greps .next/server/ and .next/static/ JS chunks
# for fingerprints of EE-only symbols. Sourcemaps (.map) and Node File Trace
# metadata (.nft.json) are excluded; those record which sources COULD be
# loaded, not what runs.
#
# The OSS bundle legitimately contains:
#   - Drizzle schema columns like `stripeCustomerId` (shared schema in
#     lib/db/schema.ts, not EE code).
#   - Env var names like STRIPE_SECRET_KEY (cloud-required list in
#     lib/env.ts; just strings, not Stripe SDK).
#   - A stub /api/webhooks/stripe route that returns 404.
#
# The bundle MUST NOT contain:
#   - EE use-case symbols (calculateMonthlyBill, *UseCase exports).
#   - EE server actions (createCheckoutAction, requestRefundAction, ...).
#   - EE components (BillingSection, RefundPanel).
#   - The Stripe SDK itself.
#
# Usage:
#   cd core && OSS_BUILD=true ... ./scripts/verify-oss-build.sh
#
# Exits non-zero if any forbidden symbol leaks.

set -uo pipefail

if [ ! -f next.config.ts ]; then
    echo "verify-oss-build: run this from the core/ directory" >&2
    exit 2
fi

export OSS_BUILD=true

echo "==> Building with OSS_BUILD=true"
# Tolerate non-zero exit: post-compile typecheck failures should not mask a
# clean bundle scan. The compiled chunks are written to disk before typecheck
# runs. Bundle absence (next checked below) is the real failure mode.
bun next build || true

if [ ! -d .next/server ] || [ ! -d .next/static ]; then
    echo "verify-oss-build: FAIL - build produced no .next/server or .next/static; cannot verify" >&2
    exit 3
fi

# Identifiers that should appear ONLY in lib/ee/ source. If any of these land
# in a built .js chunk, the runtime guard or dynamic-import boundary failed.
FORBIDDEN=(
    'calculateMonthlyBill'
    'createCheckoutSessionUseCase'
    'getBillingPortalUrlUseCase'
    'handleStripeWebhookUseCase'
    'nextBillEstimateUseCase'
    'pushStripeInvoiceUseCase'
    'requestRefundUseCase'
    'rollupBillUseCase'
    'StripeApiAdapter'
    'BillingNotEnabledError'
    'createCheckoutAction'
    'openPortalAction'
    'requestRefundAction'
    'BillingSection'
    'RefundPanel'
    'api.stripe.com'
)

# Single alternation so one grep pass scans every chunk.
PATTERN=$(IFS='|'; echo "${FORBIDDEN[*]}")

echo "==> Scanning .next/server/ and .next/static/ for EE leaks"
LEAKS=$(find .next/server .next/static -type f -name '*.js' -print0 \
    | xargs -0 grep -lE "$PATTERN" 2>/dev/null || true)

if [ -n "$LEAKS" ]; then
    echo "verify-oss-build: FAIL - EE symbols leaked into OSS bundle:" >&2
    echo "$LEAKS" >&2
    echo >&2
    echo "Matching identifiers per file:" >&2
    while IFS= read -r file; do
        echo "  $file:" >&2
        grep -oE "$PATTERN" "$file" | sort -u | sed 's/^/    /' >&2
    done <<< "$LEAKS"
    exit 1
fi

echo "verify-oss-build: OK - no EE symbols in OSS bundle"
