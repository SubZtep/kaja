FROM oven/bun:1.3.14 AS builder
WORKDIR /home/bun/app
COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY packages ./packages
COPY patches ./patches
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps/cli ./apps/cli

FROM oven/bun:1.3.14-slim AS runner
WORKDIR /home/bun/app
ENV NODE_ENV=production

USER bun
COPY --chown=bun:bun --from=builder /home/bun/app/node_modules ./node_modules
COPY --chown=bun:bun --from=builder /home/bun/app/packages ./packages
COPY --chown=bun:bun --from=builder /home/bun/app/apps/cli ./apps/cli

WORKDIR /home/bun/app/apps/cli
ENTRYPOINT ["bun", "run", "cli.tsx"]
