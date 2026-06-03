# syntax=docker/dockerfile:1.7

# Self-host image for the Bursora dashboard (Next.js + Bun). Build context is the
# umbrella repo root: core/ is the app, and sdk/ ships alongside because the
# onboarding snippets are read verbatim from sdk/examples/*.ts at runtime.
#
# No env at build: route modules read env lazily, so `next build` needs nothing.
# The real .env is injected at runtime by docker-compose (env_file) and validated
# when the container boots.

FROM oven/bun:1.3-alpine AS build
WORKDIR /workspace
ENV NODE_ENV=production
COPY core/package.json core/bun.lock core/
RUN cd core && bun install --frozen-lockfile
COPY core ./core
COPY sdk ./sdk
RUN cd core && bun run build

FROM oven/bun:1.3-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup -g 1001 -S bursora \
    && adduser -S -D -u 1001 -G bursora bursora
COPY --from=build --chown=bursora:bursora /workspace/core ./core
COPY --from=build --chown=bursora:bursora /workspace/sdk ./sdk
USER bursora
WORKDIR /workspace/core

EXPOSE 3000
HEALTHCHECK CMD wget --quiet --spider http://localhost:3000/login || exit 1
CMD ["bun", "run", "start"]
