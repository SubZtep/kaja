FROM oven/bun:1.4.0 AS builder
WORKDIR /home/bun/app
COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/openai/package.json ./apps/openai/package.json
COPY apps/widget/package.json ./apps/widget/package.json
COPY packages ./packages
RUN bun install --frozen-lockfile --ignore-scripts
COPY docs/config ./docs/config
COPY apps/api ./apps/api
COPY apps/widget ./apps/widget
RUN bun run --filter @kaja/widget build
RUN mkdir -p apps/api/public && cp apps/widget/dist/widget.js apps/api/public/widget.js
RUN bun run --filter @kaja/api build
RUN bun build --minify --target bun --outfile apps/api/dist/migrate.js apps/api/scripts/migrate.ts

FROM oven/bun:1.4.0-slim AS runner
WORKDIR /home/bun/app
ENV NODE_ENV=production

RUN mkdir -p /var/lib/kaja && chown bun:bun /var/lib/kaja

USER bun
COPY --chown=bun:bun --from=builder /home/bun/app/apps/api/dist/server.js ./server.js
COPY --chown=bun:bun --from=builder /home/bun/app/apps/api/dist/migrate.js ./migrate.js
COPY --chown=bun:bun --from=builder /home/bun/app/apps/api/public ./public
COPY --chown=bun:bun --from=builder /home/bun/app/apps/api/migrations ./migrations

EXPOSE 3001
CMD ["bun", "run", "server.js"]
