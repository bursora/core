# syntax=docker/dockerfile:1.7

# Multi-stage build for the Bursora Next.js app under Bun runtime.
#
# Build context is the repository root so the sibling `sdk/` package
# referenced as `@bursora/sdk: file:../sdk` resolves during install.
#
# Stage 1 (deps): install all deps incl. dev for the build.
# Stage 2 (build): run `bun run build` (Next 16 production build).
# Stage 3 (runtime): minimal image with prod deps + .next + source.

FROM oven/bun:1.3-alpine AS deps
WORKDIR /workspace
COPY bursora/package.json bursora/bun.lock bursora/
COPY sdk/package.json sdk/bun.lock sdk/
RUN cd bursora && bun install --frozen-lockfile

FROM oven/bun:1.3-alpine AS build
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=deps /workspace/bursora/node_modules ./bursora/node_modules
COPY bursora ./bursora
COPY sdk ./sdk
RUN cd bursora && bun run build

FROM oven/bun:1.3-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -g 1001 -S bursora \
    && adduser -S -D -u 1001 -G bursora bursora

COPY --from=build --chown=bursora:bursora /workspace/bursora/package.json ./bursora/package.json
COPY --from=build --chown=bursora:bursora /workspace/bursora/bun.lock ./bursora/bun.lock
COPY --from=build --chown=bursora:bursora /workspace/bursora/tsconfig.json ./bursora/tsconfig.json
COPY --from=build --chown=bursora:bursora /workspace/bursora/node_modules ./bursora/node_modules
COPY --from=build --chown=bursora:bursora /workspace/bursora/.next ./bursora/.next
COPY --from=build --chown=bursora:bursora /workspace/bursora/public ./bursora/public
COPY --from=build --chown=bursora:bursora /workspace/bursora/next.config.ts ./bursora/next.config.ts
COPY --from=build --chown=bursora:bursora /workspace/bursora/drizzle ./bursora/drizzle
COPY --from=build --chown=bursora:bursora /workspace/bursora/drizzle.config.ts ./bursora/drizzle.config.ts
COPY --from=build --chown=bursora:bursora /workspace/bursora/lib ./bursora/lib
COPY --from=build --chown=bursora:bursora /workspace/bursora/app ./bursora/app
COPY --from=build --chown=bursora:bursora /workspace/bursora/components ./bursora/components
COPY --from=build --chown=bursora:bursora /workspace/bursora/docs ./bursora/docs
COPY --from=build --chown=bursora:bursora /workspace/sdk ./sdk

USER bursora
WORKDIR /workspace/bursora

EXPOSE 3000
HEALTHCHECK CMD wget --quiet --spider http://localhost:3000/ || exit 1
CMD ["bun", "run", "start"]
