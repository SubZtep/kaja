FROM oven/bun:1-alpine AS builder

# Set NODE_ENV during build so loggers are configured correctly
ENV NODE_ENV=production

# Copy entire monorepo (packages/geo/data is gitignored, will be empty)
COPY . .
RUN bun install

# Build the API - geo package will be bundled without the .mmdb file
# The code handles missing database gracefully at runtime
RUN bun run --filter @kaja/api build

FROM oven/bun:1-alpine AS runner
ENV NODE_ENV=production

# Install curl for downloading database
RUN apk add --no-cache curl tar gzip

COPY --chown=bun:bun --chmod=755 --from=builder /home/bun/app/apps/api/dist ./dist
COPY --chown=bun:bun --chmod=755 --from=builder /home/bun/app/node_modules ./node_modules

# Create GeoIP directory (writable by bun user since container runs as bun)
RUN mkdir -p /usr/share/GeoIP && chown -R bun:bun /usr/share/GeoIP

# Create entrypoint script that runs as bun user
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

exec "$@"
EOF

RUN chmod +x /entrypoint.sh

# Run as non-root user for security
USER bun

EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "run", "dist/server.js"]
