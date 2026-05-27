FROM oven/bun:1-alpine AS builder

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

# Install geoipupdate and su-exec for dropping privileges
RUN apk add --no-cache geoipupdate su-exec

COPY --chown=root:root --chmod=755 --from=builder /home/bun/app/apps/api/dist ./dist
COPY --chown=root:root --chmod=755 --from=builder /home/bun/app/node_modules ./node_modules

# Create directory and set permissions
RUN mkdir -p /usr/share/GeoIP && chown bun:bun /usr/share/GeoIP

# Create entrypoint script
COPY <<'EOF' /entrypoint.sh
#!/bin/sh
set -e

if [ -n "$GEOIP_ACCOUNT_ID" ] && [ -n "$GEOIP_LICENSE_KEY" ]; then
  echo "Configuring GeoIP updates..."
  cat > /etc/GeoIP.conf <<GEOIP_EOF
AccountID $GEOIP_ACCOUNT_ID
LicenseKey $GEOIP_LICENSE_KEY
EditionIDs GeoLite2-City
DatabaseDirectory /usr/share/GeoIP
GEOIP_EOF

  echo "Downloading GeoIP database..."
  if geoipupdate; then
    chmod 644 /usr/share/GeoIP/GeoLite2-City.mmdb 2>/dev/null || true
    echo "GeoIP database ready"
  else
    echo "Warning: GeoIP update failed"
  fi
else
  echo "Warning: GEOIP_ACCOUNT_ID or GEOIP_LICENSE_KEY not set"
fi

# Drop to bun user and exec
exec su-exec bun "$@"
EOF

RUN chmod +x /entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]
CMD ["bun", "run", "dist/server.js"]
