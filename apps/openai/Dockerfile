FROM oven/bun:1.4.2 AS builder
WORKDIR /home/bun/app
COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/openai/package.json ./apps/openai/package.json
COPY apps/widget/package.json ./apps/widget/package.json
COPY packages ./packages
RUN bun install --frozen-lockfile --ignore-scripts
COPY apps/openai ./apps/openai
RUN bun run --filter @kaja/openai build

FROM oven/bun:1.4.2-slim AS runner
WORKDIR /home/bun/app
ENV NODE_ENV=production

USER bun
COPY --chown=bun:bun --from=builder /home/bun/app/apps/openai/dist/index.js ./index.js

EXPOSE 6669
CMD ["bun", "run", "index.js"]
