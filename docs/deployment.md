---
layout: page
title: Deployment
parent: Development
nav_order: 1
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
- **Geo-service** endpoint for IP geolocation (see [Configuration](/configuration#servicestoml)
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
