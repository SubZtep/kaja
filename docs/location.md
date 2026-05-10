---
layout: page
parent: Configuration
title: Location
nav_order: 2
---

# Geo IP Database

To enable IP-based location lookup, register with MaxMind.

## Setup

Run these steps on localhost and on the server.

1. Create a [MaxMind account](https://support.maxmind.com/knowledge-base/articles/create-a-maxmind-account).
2. Generate a [license key](https://support.maxmind.com/knowledge-base/articles/generate-a-maxmind-license-key).
3. Install the [GeoIP Update](https://maxmind.github.io/geoipupdate/) program and fetch the **GeoLite2-City** binary database.
   
   Your `/etc/GeoIP.conf` should look like this:

   ```ini
   AccountID [numeric]
   LicenseKey [hash]
   EditionIDs GeoLite2-City
   ```

## Update Database

```sh
geoipupdate -d packages/location/data
```

---

Next:

[Open the **model** page](/model){: .btn .btn-green .fs-5 }
