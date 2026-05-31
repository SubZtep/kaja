---
layout: page
title: Deployment
parent: Development
nav_order: 1
---

Notes.

## Prerequisites

- [**GitHub + Ubuntu** 24.04](https://disco.cloud/docs/#prerequisites) — the publish webhook triggers deployment on the fully managed box. Even the smallest [Hetzner VPS](https://www.hetzner.com/cloud/cost-optimized) is more than enough to host several services and a database, as long as traffic stays reasonable.
- **SMTP server** is required for authentication emails.
- MaxMind’s [**GeoLite City**](https://support.maxmind.com/knowledge-base/articles/create-a-maxmind-account#sign-up-for-geolite) database.
  > 💡 Install [`geoipupdate`](https://github.com/maxmind/geoipupdate) on the server.

Attaching PostgreSQL instance to the API project in Disco automatically creates the `DATABASE_URL` env var.

On the server, first run `2026-03-01-uuidv7.sql` manually.


<!-- # Configuration

This section describes all the different configuration settings. Each monorepo workspace has its own environment variables.

## Local

Bootstrap your local env files (committed `.env.example` is an example, `.env` is your gitignored copy):

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/cli/.env.example apps/cli/.env
```

Generate local secret (appends `BETTER_AUTH_SECRET` to `apps/api/.env`):

```sh
./apps/api/scripts/create_local_secrets.sh
```

## Server

Docker builds omit `.env` files. Set the environment variables on the server.

# Deployment

These are snippets of how [kaja.io](https://kaja.io) is deployed to its current environment. [Disco](https://disco.cloud) handles most deployment work — you push to `main` and the pipeline runs. -->


<!-- ## Deploy

Install [Disco](https://disco.cloud/docs) on the server and configure it.

Create two **Projects** and add this additional **environment variable** to the existing ones in the Disco interface:

| Project | Variable          | Value            |
| ------- | ----------------- | ---------------- |
| API     | `DISCO_JSON_PATH` | `disco.api.json` |
| Web     | `DISCO_JSON_PATH` | `disco.web.json` |

Install and attach the **PostgreSQL addon** to the API project.

> Automatic database migration is not needed right now — just run SQL updates directly. 🫪
{: .warning }

**No `.env*` files** — inject vars via the host / orchestrator (Disco, Docker `--env-file` outside the image, k8s secrets, etc.). -->
