#!/bin/sh
set -e

# Create GeoIP.conf if credentials are provided
if [ -n "$GEOIP_ACCOUNT_ID" ] && [ -n "$GEOIP_LICENSE_KEY" ]; then
  echo "Configuring GeoIP update..."
  cat > /etc/GeoIP.conf <<EOF
AccountID $GEOIP_ACCOUNT_ID
LicenseKey $GEOIP_LICENSE_KEY
EditionIDs GeoLite2-City GeoLite2-Country
DatabaseDirectory /usr/share/GeoIP
EOF

  # Download/update GeoIP database
  echo "Downloading GeoIP database..."
  geoipupdate -v || echo "Warning: GeoIP update failed, continuing anyway..."
  geoipupdate
else
  echo "Warning: GEOIP_ACCOUNT_ID or GEOIP_LICENSE_KEY not set. Skipping GeoIP database download."
fi

# Start the application
exec "$@"
