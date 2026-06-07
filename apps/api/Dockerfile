FROM oven/bun:1.3.14 AS builder
WORKDIR /home/bun/app
COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY packages ./packages
RUN bun install --frozen-lockfile
COPY apps/api ./apps/api
RUN bun run --filter @kaja/api build

FROM oven/bun:1.3.14-slim AS runner
WORKDIR /home/bun/app
ENV NODE_ENV=production

USER bun
# Copy the self-contained bundle (includes all dependencies)
COPY --chown=bun:bun --chmod=555 --from=builder /home/bun/app/apps/api/dist ./dist

EXPOSE 3001
CMD ["bun", "run", "dist/server.js"]
