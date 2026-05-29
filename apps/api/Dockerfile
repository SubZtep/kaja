FROM oven/bun:1-alpine

WORKDIR /app

EXPOSE 3001

CMD ["bun", "x", "serve", "-l", "3001", "https://example.com"]

# FROM oven/bun:1-alpine AS builder

# COPY package.json bun.lock tsconfig.json ./
# COPY apps/api/package.json ./apps/api/package.json
# COPY packages ./packages
# RUN bun install

# COPY apps/api ./apps/api
# RUN bun run --filter @kaja/api build
# RUN bun install --production

# FROM oven/bun:1-alpine AS runner
# ENV NODE_ENV=production
# USER bun

# COPY --chown=bun:bun --chmod=755 --from=builder /home/bun/app/apps/api/dist ./dist
# COPY --chown=bun:bun --chmod=755 --from=builder /home/bun/app/node_modules ./node_modules

# EXPOSE 3001
# CMD ["bun", "run", "dist/server.js"]
