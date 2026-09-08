FROM oven/bun:1.4.2 AS builder
WORKDIR /home/bun/app
COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/tui/package.json ./apps/tui/package.json
COPY packages ./packages
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps/tui ./apps/tui

FROM oven/bun:1.4.2-slim AS runner
WORKDIR /home/bun/app
ENV NODE_ENV=production

USER bun
COPY --chown=bun:bun --from=builder /home/bun/app/node_modules ./node_modules
COPY --chown=bun:bun --from=builder /home/bun/app/packages ./packages
COPY --chown=bun:bun --from=builder /home/bun/app/apps/tui ./apps/tui

WORKDIR /home/bun/app/apps/tui
ENTRYPOINT ["bun", "run", "cli.ts"]
