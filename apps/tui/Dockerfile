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
# The TUI runs from source and imports its config templates from the repo root
COPY docs/config ./docs/config
COPY apps/tui ./apps/tui

FROM oven/bun:1.4.2-slim AS runner
WORKDIR /home/bun/app
ENV NODE_ENV=production

USER bun
COPY --chown=bun:bun --from=builder /home/bun/app/node_modules ./node_modules
COPY --chown=bun:bun --from=builder /home/bun/app/packages ./packages
COPY --chown=bun:bun --from=builder /home/bun/app/docs/config ./docs/config
COPY --chown=bun:bun --from=builder /home/bun/app/apps/tui ./apps/tui

WORKDIR /home/bun/app/apps/tui
ENTRYPOINT ["bun", "run", "cli.ts"]
