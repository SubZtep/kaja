---
layout: page
parent: Configuration
title: Environment Variables
nav_order: 1
---

## Secrets and endpoints (for each app in the monorepo)

Each app has a committed `.env.example` with developer defaults. To override defaults, copy it to `.env` (gitignored) and fill it in, or set the variables as host environment variables in production.`

### [Web](https://github.com/SubZtep/kaja/blob/main/apps/web/.env.example)

| Variable Name | Value                 | Description                                                |
| ------------- | --------------------- | ---------------------------------------------------------- |
| API_URL       | http://localhost:3001 | **Optional**, server-only (used by SSR / server functions) |
| VITE_API_URL  | http://localhost:3001 | Client-exposed; baked into bundle at build time            |
| VITE_APP_URL  | http://localhost:3000 | Client-exposed                                             |

### [API](https://github.com/SubZtep/kaja/blob/main/apps/api/.env.example)

| Variable Name       | Value                                              | Description                                                 |
| ------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| PORT                | 3001                                               |                                                             |
| CORS_ORIGIN         | http://localhost:3000                              | Website URL                                                 |
| CROSS_PARENT_DOMAIN | ondis.co                                           | **Optional**, set the base domain if apps are in subdomains |
| DATABASE_URL        | postgresql://testuser:testpass@localhost:5433/test | Postgres connection string                                  |
| BETTER_AUTH_URL     | http://localhost:3001                              | API URL                                                     |
| EMAIL_FROM          | `kaja[bot] <noreply@kaja.io>`                      |                                                             |
| SMTP_HOST           | localhost                                          |                                                             |
| SMTP_PORT           | 1025                                               |                                                             |
| SMTP_SECURE         |                                                    | _Usually empty_                                             |
| SMTP_USER           |                                                    |                                                             |
| SMTP_PASS           |                                                    |                                                             |
| BETTER_AUTH_SECRET  |                                                    | Generate: `openssl rand -base64 32`                         |

### [CLI](https://github.com/SubZtep/kaja/blob/main/apps/cli/.env.example)

| Variable Name | Value                 | Description |
| ------------- | --------------------- | ----------- |
| API_URL       | http://localhost:3001 | API URL     |

CLI also supports a non-secret local config file resolved by [`env-paths`](https://www.npmjs.com/package/env-paths).
On Linux this is typically `~/.config/kaja-nodejs/config.json` with default options.

- Used for local preferences (for example Ollama host/model).
- Never store auth tokens here; tokens stay in the system secret store.
- Precedence is: `--api-url` -> `API_URL` -> `config.json(apiUrl)` -> built-in default.

---

Next:

[Open the **location** page](/location){: .btn .btn-blue .fs-5 }
