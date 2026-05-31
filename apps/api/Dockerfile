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

FROM builder AS prod-deps
RUN bun install --production --frozen-lockfile

FROM oven/bun:1.3.14-slim AS runner
WORKDIR /home/bun/app
ENV NODE_ENV=production

USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends geoipupdate && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /usr/share/GeoIP && \
    chown bun:bun /usr/share/GeoIP

USER bun
COPY --chown=bun:bun --chmod=555 --from=prod-deps /home/bun/app/apps/api/dist ./dist
COPY --chown=bun:bun --chmod=555 --from=prod-deps /home/bun/app/node_modules ./node_modules

EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "run", "dist/server.js"]
