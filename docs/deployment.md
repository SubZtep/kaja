---
layout: page
title: Deployment
nav_order: 4
---

# Deploy

All you need is:
- 2 containers (api+web)
- PostgreSQL
- SMTP

> [Gmail’s SMTP](/kaja/deploy/) works and is free, but only for minimal traffic.

## [Disco](https://disco.cloud/docs/) Deploy

Create two **Projects** and add **environment variables**:

| Project | Variable          | Value            |
| ------- | ----------------- | ---------------- |
| API     | `DISCO_JSON_PATH` | `disco.api.json` |
| Web     | `DISCO_JSON_PATH` | `disco.web.json` |

## Production environment variables

**No `.env*` files are baked into images** — all values must be injected by the host / orchestrator at the right phase (build vs runtime). Refer to [Configuration](configuration.md) for descriptions and dev defaults.

### Web (`@kaja/web`)

| Variable       | Phase   | Notes                                                                          |
| -------------- | ------- | ------------------------------------------------------------------------------ |
| `VITE_API_URL` | build   | Inlined into client bundle by Vite — must be set at `docker build`.            |
| `VITE_APP_URL` | build   | Same as above.                                                                 |
| `API_URL`      | runtime | Server-side fetch target (SSR / server functions). Defaults to `VITE_API_URL`. |

### API (`@kaja/api`)

Required at runtime:

| Variable              | Required | Notes                                                       |
| --------------------- | -------- | ----------------------------------------------------------- |
| `PORT`                | no       | Defaults to `3001`.                                         |
| `CORS_ORIGIN`         | yes      | Public web URL.                                             |
| `CROSS_PARENT_DOMAIN` | no       | Set when web + api live on subdomains.                      |
| `DATABASE_URL`        | yes      | Postgres connection string.                                 |
| `BETTER_AUTH_URL`     | yes      | Public api URL.                                             |
| `BETTER_AUTH_SECRET`  | yes      | ≥ 32 chars. `openssl rand -base64 32`.                      |
| `EMAIL_FROM`          | yes      | e.g. `"Admin Starter <noreply@example.com>"`.               |
| `SMTP_HOST`           | yes      |                                                             |
| `SMTP_PORT`           | yes      |                                                             |
| `SMTP_SECURE`         | no       | `true` for TLS.                                             |
| `SMTP_USER`           | no       |                                                             |
| `SMTP_PASS`           | no       |                                                             |
| `NODE_ENV`            | no       | Defaults to `development`. Set `production` in prod images. |
