FROM oven/bun:1.3.14 AS builder
WORKDIR /home/bun/app
COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/openai/package.json ./apps/openai/package.json
COPY packages ./packages
COPY patches ./patches
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps/api ./apps/api
RUN bun run --filter @kaja/api build

FROM oven/bun:1.3.14-slim AS runner
WORKDIR /home/bun/app
ENV NODE_ENV=production

USER bun
COPY --chown=bun:bun --from=builder /home/bun/app/apps/api/dist/server.js ./server.js

EXPOSE 3001
CMD ["bun", "run", "server.js"]
