FROM oven/bun:1.4.2 AS builder
WORKDIR /home/bun/app
COPY package.json bun.lock tsconfig.json ./
COPY patches ./patches
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/tui/package.json ./apps/tui/package.json
COPY apps/sandbox/package.json ./apps/sandbox/package.json
COPY packages/nasi/package.json ./packages/nasi/package.json
COPY packages/schema/package.json ./packages/schema/package.json
COPY packages/shared/package.json ./packages/shared/package.json
# Only manifests before the install, so a source edit anywhere reuses the installed dependencies layer
RUN bun install --frozen-lockfile --ignore-scripts
COPY packages ./packages
COPY apps/web ./apps/web
ENV NODE_ENV=production
RUN bun run --filter @kaja/web build

FROM oven/bun:1.4.2-slim AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
# API_URL / VITE_API_URL / VITE_APP_URL are injected
# at container runtime (e.g. `disco env:set`), not baked in at build time.
WORKDIR /home/bun/app
USER bun
COPY --chown=bun:bun --chmod=555 --from=builder /home/bun/app/apps/web/.output ./

EXPOSE 3000
CMD ["bun", "--preload", "./server/instrument.server.mjs", "server/index.mjs"]
