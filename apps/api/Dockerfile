FROM oven/bun:1-alpine AS builder
USER bun

COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/geo/package.json ./packages/geo/
COPY packages/logger/package.json ./packages/logger/
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile

COPY apps/api ./apps/api
COPY packages ./packages
RUN bun run --filter @kaja/api build
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS runner
ENV NODE_ENV=production
USER bun

COPY --chown=bun:bun --chmod=755 --from=builder /home/bun/app/apps/api/dist ./dist
COPY --chown=bun:bun --chmod=755 --from=builder /home/bun/app/node_modules ./node_modules

EXPOSE 3001
CMD ["bun", "run", "dist/server.js"]
