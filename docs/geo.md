---
layout: page
parent: Configuration
title: Location
nav_order: 2
---

# Geo

## IP to Location

Kaja uses an external geo-service for IP-based location lookups. The geo-service is a separate microservice that provides IP geolocation using MaxMind's GeoLite2-City database.

### Setup

Configure the API to connect to the geo-service by setting these environment variables in `apps/api/.env`:

```env
GEO_SERVICE_URL=https://your-geo-service.example.com
GEO_SERVICE_API_KEY=your-api-key-here
```

The geo-service handles all MaxMind database management internally, including periodic updates.

## GeoName ID

>  Best flow:
>
>  IP geolocate user (lat/lon, country)
>  Call GeoNames findNearbyPlaceNameJSON (lat/lon)
>  Store geonameId + country_code (+ optional cached city label)
>  GeoNames endpoints you’ll use most:
>
>  findNearbyPlaceNameJSON (from coordinates)
>  searchJSON (from city text + country)
>  hierarchyJSON (optional admin hierarchy)

---

Next:

[Open the **model** page](/model){: .btn .btn-green .fs-5 }
