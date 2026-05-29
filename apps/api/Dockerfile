FROM oven/bun:1 AS builder
WORKDIR /home/bun/app

COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages ./packages
RUN bun install

COPY apps/api ./apps/api
RUN bun run --filter @kaja/api build
RUN bun install --production

FROM oven/bun:1-alpine AS runner
WORKDIR /home/bun/app
ENV NODE_ENV=production
USER bun

COPY --chown=bun:bun --from=builder /home/bun/app/apps/api/dist ./dist
COPY --chown=bun:bun --from=builder /home/bun/app/node_modules ./node_modules

EXPOSE 3001
CMD ["bun", "run", "dist/server.js"]
