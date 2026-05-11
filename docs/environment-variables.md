---
layout: page
parent: Configuration
title: Environment Variables
nav_order: 1
---

# Environment Variables

Each monorepo workspace manages custom environment variables. The values below are good examples, but are not yet finalised.

## [API](https://github.com/SubZtep/kaja/blob/main/apps/api/.env.example)

| Variable Name       | Value                                                  | Description                                                 |
| ------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| BETTER_AUTH_SECRET  | `qXt2Moplrpfcr0g/1IZO4paJa4qoN/BgM3kU6fK5Bf0=`         | Generate: `openssl rand -base64 32`                         |
| BETTER_AUTH_URL     | `https://api.kaja.io`                                  | API base endpoint                                           |
| CORS_ORIGIN         | `https://kaja.io`                                      | Website URL                                                 |
| CROSS_PARENT_DOMAIN | `kaja.io`                                              | **Optional**, set the base domain if apps are in subdomains |
| DATABASE_URL        | `postgresql://testuser:testpass@localhost:5433/testdb` | PostgreSQL connection string                                |
| EMAIL_FROM          | `kaja[bot] <noreply@kaja.io>`                          | Sender of system messages                                   |
| PORT                | `3001`                                                 | API port                                                    |
| SMTP_HOST           | `smtp.gmail.com`                                       |                                                             |
| SMTP_PASS           | `abcdefghijklmnop`                                     |                                                             |
| SMTP_PORT           | `587`                                                  |                                                             |
| SMTP_SECURE         |                                                        | _Usually empty_ (`true` for TLS)                            |
| SMTP_USER           | `noname@gmail.com`                                     |                                                             |

## [Web](https://github.com/SubZtep/kaja/blob/main/apps/web/.env.example)

| **Name**     | Value                 | Description                                                                                  |
| ------------ | --------------------- | -------------------------------------------------------------------------------------------- |
| API_URL      | `https://api.kaja.io` | **Optional**, server-side fetch target (SSR / server functions). Defaults to `VITE_API_URL`. |
| VITE_API_URL | `https://api.kaja.io` | Client-exposed; baked into bundle at build time                                              |
| VITE_APP_URL | `https://kaja.io`     | Client-exposed                                                                               |

## [CLI](https://github.com/SubZtep/kaja/blob/main/apps/cli/.env.example)

| Variable Name | Value                 | Description       |
| ------------- | --------------------- | ----------------- |
| API_URL       | `https://api.kaja.io` | API base endpoint |

CLI also supports a non-secret local config file.
On Linux this is typically `~/.config/kaja/config.toml` with default options.

- Used for local preferences (for example Ollama host/model).
- Never store auth tokens here; tokens stay in the system secret store.
<!-- - Precedence is: `--api-url` -> `API_URL` -> `config.json(apiUrl)` -> built-in default. -->

---

Next:

[Open the **Geo** page](/geo){: .btn .btn-green .fs-5 }
