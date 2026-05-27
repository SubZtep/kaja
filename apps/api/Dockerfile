FROM oven/bun:1-alpine AS builder

# Set NODE_ENV during build so loggers are configured correctly
ENV NODE_ENV=production

COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/geo/package.json ./packages/geo/
COPY packages/logger/package.json ./packages/logger/
COPY packages/schemas/package.json ./packages/schemas/
COPY packages/shared/package.json ./packages/shared/
RUN bun install

COPY apps/api ./apps/api
COPY packages ./packages
RUN bun run --filter @kaja/api build

FROM oven/bun:1-alpine AS runner
ENV NODE_ENV=production

# Install curl and su-exec for downloading database and dropping privileges
RUN apk add --no-cache curl su-exec tar gzip

# Note: Container starts as root to download GeoIP database if needed,
# then drops to 'bun' user via su-exec in entrypoint.sh (see line 58)

COPY --chown=root:root --chmod=755 --from=builder /home/bun/app/apps/api/dist ./dist
COPY --chown=root:root --chmod=755 --from=builder /home/bun/app/node_modules ./node_modules

# Create directory and set permissions
RUN mkdir -p /usr/share/GeoIP && chown bun:bun /usr/share/GeoIP

# Create entrypoint script
COPY <<'EOF' /entrypoint.sh
#!/bin/sh
set -e

# Check if GeoIP database already exists (mounted via volume)
if [ -f /usr/share/GeoIP/GeoLite2-City.mmdb ]; then
  echo "GeoIP database found (volume mount)"
elif [ -n "$GEOIP_ACCOUNT_ID" ] && [ -n "$GEOIP_LICENSE_KEY" ]; then
  echo "Downloading GeoIP database..."

  # Download the tarball from MaxMind
  curl -L -u "${GEOIP_ACCOUNT_ID}:${GEOIP_LICENSE_KEY}" \
    "https://download.maxmind.com/geoip/databases/GeoLite2-City/download?suffix=tar.gz" \
    -o /tmp/GeoLite2-City.tar.gz

  if [ $? -eq 0 ]; then
    # Extract the .mmdb file
    tar -xzf /tmp/GeoLite2-City.tar.gz -C /tmp
    find /tmp -name "GeoLite2-City.mmdb" -exec mv {} /usr/share/GeoIP/GeoLite2-City.mmdb \;
    chmod 644 /usr/share/GeoIP/GeoLite2-City.mmdb
    rm -rf /tmp/GeoLite2-City.tar.gz /tmp/GeoLite2-City_*
    echo "GeoIP database ready"
  else
    echo "Warning: GeoIP download failed"
  fi
else
  echo "Warning: No GeoIP database found and GEOIP_ACCOUNT_ID/GEOIP_LICENSE_KEY not set"
fi

# Drop to bun user and exec
exec su-exec bun "$@"
EOF

RUN chmod +x /entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "run", "dist/server.js"]
