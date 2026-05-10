---
layout: page
parent: Configuration
title: Environment Variables
nav_order: 1
---

## Secrets and endpoints (for each app in the monorepo)

Each app has a committed `.env.example` listing every variable. Copy to `.env` (gitignored) and fill in, or inject as host env in production.

Default developer values:

### `/apps/web/.env.example` -> `/apps/web/.env`

| Variable Name | Secret? | Value                 | Description                                                |
| ------------- | ------- | --------------------- | ---------------------------------------------------------- |
| API_URL       | no      | http://localhost:3001 | **Optional**, server-only (used by SSR / server functions) |
| VITE_API_URL  | no      | http://localhost:3001 | Client-exposed; baked into bundle at build time            |
| VITE_APP_URL  | no      | http://localhost:3000 | Client-exposed                                             |


### `/apps/api/.env.example` -> `/apps/api/.env`

| Variable Name       | Secret? | Value                                              | Description                                                 |
| ------------------- | ------- | -------------------------------------------------- | ----------------------------------------------------------- |
| PORT                | no      | 3001                                               |                                                             |
| CORS_ORIGIN         | no      | http://localhost:3000                              | Website URL                                                 |
| CROSS_PARENT_DOMAIN | no      | ondis.co                                           | **Optional**, set the base domain if apps are in subdomains |
| DATABASE_URL        | yes     | postgresql://testuser:testpass@localhost:5433/test | Postgres connection string                                  |
| BETTER_AUTH_URL     | no      | http://localhost:3001                              | API URL                                                     |
| EMAIL_FROM          | no      | `"Admin Starter <noreply@test.com>"`               |                                                             |
| SMTP_HOST           | no      | localhost                                          |                                                             |
| SMTP_PORT           | no      | 1025                                               |                                                             |
| SMTP_SECURE         | no      |                                                    | _Usually empty_                                             |
| SMTP_USER           | yes     |                                                    |                                                             |
| SMTP_PASS           | yes     |                                                    |                                                             |
| BETTER_AUTH_SECRET  | yes     |                                                    | Generate: `openssl rand -base64 32`                         |

### `/apps/cli/.env.example` -> `/apps/cli/.env`

| Variable Name | Secret? | Value                 | Description |
| ------------- | ------- | --------------------- | ----------- |
| API_URL       | no      | http://localhost:3001 | API URL     |

CLI also supports a non-secret local config file resolved by [`env-paths`](https://www.npmjs.com/package/env-paths).
On Linux this is typically `~/.config/kaja-nodejs/config.json` with default options.

- Used for local preferences (for example Ollama host/model).
- Never store auth tokens here; tokens stay in the system secret store.
- Precedence is: `--api-url` -> `API_URL` -> `config.json(apiUrl)` -> built-in default.

---

[Open **Location**](/environment-variables){: .btn .btn-green }
