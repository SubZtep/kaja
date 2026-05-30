FROM oven/bun:1-alpine AS builder

COPY package.json bun.lock tsconfig.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY packages ./packages
RUN bun install --frozen-lockfile

COPY apps/web ./apps/web
COPY packages ./packages

ARG VITE_APP_URL
ARG VITE_API_URL
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_API_URL=$VITE_API_URL
RUN bun run --filter @kaja/web build

FROM oven/bun:1-alpine AS runner
ARG VITE_API_URL
ARG VITE_APP_URL
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
# Runtime env vars for server-side functions
ENV API_URL=$VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_URL=$VITE_APP_URL

COPY --chown=root:root --chmod=755 --from=builder /home/bun/app/apps/web/.output ./
USER bun

EXPOSE 3000
CMD ["bun", "run", "server/index.mjs"]
