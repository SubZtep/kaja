FROM oven/bun:1.4.2 AS builder
WORKDIR /home/bun/app
COPY package.json bun.lock tsconfig.json ./
COPY patches ./patches
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/tui/package.json ./apps/tui/package.json
COPY apps/sandbox/package.json ./apps/sandbox/package.json
COPY packages/nasi/package.json ./packages/nasi/package.json
COPY packages/schema/package.json ./packages/schema/package.json
COPY packages/shared/package.json ./packages/shared/package.json
# Only manifests before the install, so a source edit anywhere reuses the installed dependencies layer
RUN bun install --frozen-lockfile --ignore-scripts
COPY packages ./packages
COPY config ./config
COPY apps/api ./apps/api
RUN bun run --filter @kaja/api build
RUN bun build --minify --target bun --outfile apps/api/dist/migrate.js apps/api/migrate.ts

FROM oven/bun:1.4.2-slim AS runner
WORKDIR /home/bun/app
ENV NODE_ENV=production

USER bun
COPY --chown=bun:bun --from=builder /home/bun/app/apps/api/dist/server.js ./server.js
COPY --chown=bun:bun --from=builder /home/bun/app/apps/api/dist/migrate.js ./migrate.js
COPY --chown=bun:bun --from=builder /home/bun/app/apps/api/public ./public
COPY --chown=bun:bun --from=builder /home/bun/app/apps/api/migrations ./migrations

EXPOSE 3001
# Unhealthy only when the database is unreachable (see /health/ready); the slim image has no curl, so Bun asks
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["bun", "-e", "const r = await fetch(`http://localhost:${process.env.PORT || 3001}/health/ready`); process.exit(r.ok ? 0 : 1)"]
CMD ["bun", "run", "server.js"]
