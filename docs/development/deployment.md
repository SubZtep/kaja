---
layout: page
title: Deployment
parent: Development
nav_order: 12.5
---

# Deployment

How [kaja.io](https://kaja.io) reaches its current environment.
[Disco](https://disco.cloud) does most of the work — push to `main` and the pipeline runs.

## Prerequisites

- [**GitHub + Ubuntu 24.04**](https://disco.cloud/docs/#prerequisites) — the publish webhook
  triggers deployment on the managed box. Even the smallest
  [Hetzner VPS](https://www.hetzner.com/cloud/cost-optimized) hosts several services and a database
  comfortably at modest traffic.
- **SMTP server** for authentication emails.
- **Geo-service** endpoint for IP geolocation (see [Services](/configuration/services)).

## Projects

Create two Disco **Projects** and point each at its own config file:

| Project | Variable | Value |
| --- | --- | --- |
| API | `DISCO_JSON_PATH` | `disco.api.json` |
| Web | `DISCO_JSON_PATH` | `disco.web.json` |

Install and attach the **PostgreSQL addon** to the API project — it creates `DATABASE_URL`
automatically.

The API config declares a named `nasi-data` volume mounted at `/var/lib/kaja` and a
`hook:deploy:start:before` step that runs `bun run migrate.js`, so **migrations apply on every
deploy** before the new container takes traffic. Named volumes, not host bind mounts — `compose.yaml`
is for local development only.

## Environment variables

Docker builds omit `.env` files entirely. **No `.env*` file ships to production** — inject
variables on the server (Disco's UI, `docker --env-file` outside the image, k8s secrets).

Locally, bootstrap from the generated templates instead:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
./scripts/create_local_secrets.sh   # appends BETTER_AUTH_SECRET
```

## Production checklist

- A strong `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and real SMTP credentials.
- A strong `CONFIG_API_TOKEN`. `/config/*` is **fail-closed**: a missing or empty token returns 401
  for every request on the prefix and never serves provider API keys.
- `CORS_ORIGIN` matching the public web origin exactly. Note the [widget](/widget) routes are
  deliberately exempt — they reflect origins and gate on the key's own allowlist instead.
- `NODE_ENV=production` (JSON logs, no pretty printer, no `/reference` UI).
- A quieter `KAJA_LOG_LEVEL` (`info` or `warn`).
- Rate limits left on — they only auto-disable under `bun test`.

## CLI release automation

`.github/workflows/auto-version.yaml` runs on `main`:

1. Detects which workspaces changed under `apps/**` / `packages/**`.
2. Bumps the matching `package.json` versions, commits with `[skip ci]`, and pushes tags
   (`tui@x.y.z`, …).
3. If the **TUI** was bumped, it dispatches **Build and release TUI** on `main` via
   `gh workflow run`.

`[skip ci]` keeps the bump commit from re-triggering CI and auto-version — which is also why the
explicit dispatch, not a tag trigger, is what ships the binary. No personal access token is
needed: the default `GITHUB_TOKEN` can push the bump and start the dispatch given `contents: write`
and `actions: write`.

You can always run **Build and release TUI** by hand from the Actions tab.

---

Next:

[Vision](/development/vision){: .btn .btn-green .fs-5 }
