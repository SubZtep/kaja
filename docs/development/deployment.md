---
layout: page
title: Deployment
parent: Development
nav_order: 9.1
---

# Deployment

These are snippets of how [kaja.io](https://kaja.io) is deployed to its current environment.
[Disco](https://disco.cloud) handles most of the work — push to `main` and the pipeline runs.

## Prerequisites

- [**GitHub + Ubuntu** 24.04](https://disco.cloud/docs/#prerequisites) — the publish webhook
  triggers deployment on the fully managed box. Even the smallest
  [Hetzner VPS](https://www.hetzner.com/cloud/cost-optimized) is more than enough to host
  several services and a database, as long as traffic stays reasonable.
- **SMTP server** is required for authentication emails.
- **Geo-service** endpoint for IP geolocation (see [Configuration](/configuration#services)
  for setup details).

## Local environment files

Each app under `/apps/*/` ships two env files: a committed `.env.example` (template, no real
values) and a gitignored `.env` (your local copy, real values + secrets). Bootstrap them:

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/cli/.env.example apps/cli/.env
```

Generate a local secret (appends `BETTER_AUTH_SECRET` to `apps/api/.env`):

```sh
./apps/api/scripts/create_local_secrets.sh
```

## Server setup

Docker builds omit `.env` files entirely — inject environment variables on the server instead
(Disco, Docker `--env-file` outside the image, k8s secrets, etc.). No `.env*` files ship to
production.

Install [Disco](https://disco.cloud/docs) on the server and configure it.

Create two **Projects** (API and Web) and add this additional environment variable to each,
alongside the usual ones:

| Project | Variable | Value |
| --- | --- | --- |
| API | `DISCO_JSON_PATH` | `disco.api.json` |
| Web | `DISCO_JSON_PATH` | `disco.web.json` |

Install and attach the **PostgreSQL addon** to the API project — this automatically creates the
`DATABASE_URL` env var.

> Automatic database migration is not needed right now — just run SQL updates directly. 🫪
{: .warning }

After server init, run the migration scripts from `apps/api/migrations`.
New migration files are **not** applied automatically to an existing database volume —
always re-run migrations after deploy when SQL files change.

## Production checklist (security)

- Set a strong `BETTER_AUTH_SECRET` and real SMTP credentials.
- Set a strong `CONFIG_API_TOKEN` on the API. `/config/*` is **fail-closed**: missing/empty
  token returns 401 and never serves provider API keys.
- CLI `kaja config fetch` needs that token via `services.toml` `[api].token` or the
  `CONFIG_API_TOKEN` environment variable.
- `CORS_ORIGIN` must match the public web origin.
- Prefer quieter `KAJA_LOG_LEVEL` (`info` / `warn`) in production.

## CLI release automation

Automatic Versioning (`.github/workflows/auto-version.yaml`) on `main`:

1. Detects which workspaces changed under `apps/**` / `packages/**`
2. Bumps the matching `package.json` versions, commits with `[skip ci]`, and pushes tags (`cli@x.y.z`, …)
3. If the **CLI** was bumped, it **dispatches** [Build and release CLI](../.github/workflows/build-cli.yaml) on `main` via `gh workflow run`

`[skip ci]` stops the bump commit from re-running CI and auto-version (and would also block a tag-triggered build). The explicit dispatch is what actually ships the CLI binary/release.

No personal access token (`PAT_TOKEN`) is required for this flow: the default `GITHUB_TOKEN` can push the bump and start `workflow_dispatch` when the job has `contents: write` and `actions: write`.

You can still run **Build and release CLI** manually from the Actions tab.
