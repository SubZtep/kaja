FROM oven/bun:1.4.0 AS builder
WORKDIR /home/bun/app
COPY package.json bun.lock tsconfig.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/openai/package.json ./apps/openai/package.json
COPY apps/widget/package.json ./apps/widget/package.json
COPY packages ./packages
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps/web ./apps/web
COPY apps/widget ./apps/widget
COPY packages ./packages
ENV NODE_ENV=production
RUN bun run --filter @kaja/web build

FROM oven/bun:1.4.0-slim AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
# API_URL / VITE_API_URL / VITE_APP_URL / VITE_UMAMI_WEBSITE_ID are injected
# at container runtime (e.g. `disco env:set`), not baked in at build time.
WORKDIR /home/bun/app
USER bun
COPY --chown=bun:bun --chmod=555 --from=builder /home/bun/app/apps/web/.output ./

EXPOSE 3000
CMD ["bun", "run", "server/index.mjs"]
