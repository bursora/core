# syntax=docker/dockerfile:1.7

# Self-host only. Bursora Cloud builds the dashboard inside a shared bun
# container; this Dockerfile is the artifact for users running their own.
#
# Multi-stage build for the Bursora dashboard (Next.js + Bun).
#
# Build context is the umbrella repo root so the sibling `sdk/` package
# referenced as `@bursora/sdk: file:../sdk` resolves during install.
#
# Stage 1 (deps): install all deps incl. dev for the build.
# Stage 2 (build): run `bun run build` (Next 16 production build).
# Stage 3 (runtime): minimal image with prod deps + .next + source.

FROM oven/bun:1.3-alpine AS deps
WORKDIR /workspace
COPY core/package.json core/bun.lock core/
COPY sdk/package.json sdk/bun.lock sdk/
RUN cd core && bun install --frozen-lockfile

FROM oven/bun:1.3-alpine AS build
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=deps /workspace/core/node_modules ./core/node_modules
COPY core ./core
COPY sdk ./sdk
RUN cd core && bun run build

FROM oven/bun:1.3-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -g 1001 -S bursora \
    && adduser -S -D -u 1001 -G bursora bursora

COPY --from=build --chown=bursora:bursora /workspace/core/package.json ./core/package.json
COPY --from=build --chown=bursora:bursora /workspace/core/bun.lock ./core/bun.lock
COPY --from=build --chown=bursora:bursora /workspace/core/tsconfig.json ./core/tsconfig.json
COPY --from=build --chown=bursora:bursora /workspace/core/node_modules ./core/node_modules
COPY --from=build --chown=bursora:bursora /workspace/core/.next ./core/.next
COPY --from=build --chown=bursora:bursora /workspace/core/public ./core/public
COPY --from=build --chown=bursora:bursora /workspace/core/next.config.ts ./core/next.config.ts
COPY --from=build --chown=bursora:bursora /workspace/core/drizzle ./core/drizzle
COPY --from=build --chown=bursora:bursora /workspace/core/drizzle.config.ts ./core/drizzle.config.ts
COPY --from=build --chown=bursora:bursora /workspace/core/clickhouse ./core/clickhouse
COPY --from=build --chown=bursora:bursora /workspace/core/lib ./core/lib
COPY --from=build --chown=bursora:bursora /workspace/core/app ./core/app
COPY --from=build --chown=bursora:bursora /workspace/core/components ./core/components
COPY --from=build --chown=bursora:bursora /workspace/core/docs ./core/docs
COPY --from=build --chown=bursora:bursora /workspace/sdk ./sdk

USER bursora
WORKDIR /workspace/core

EXPOSE 3000
HEALTHCHECK CMD wget --quiet --spider http://localhost:3000/ || exit 1
CMD ["bun", "run", "start"]
