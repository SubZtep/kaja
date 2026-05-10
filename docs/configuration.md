---
layout: page
title: Configuration
nav_order: 2
---

# Configuration

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
./scripts/create_local_secrets.sh
```

## Server

Docker builds omit `.env` files. Set the environment variables on the server.

If you are using Disco Deploy, don’t forget to set an additional `DISCO_JSON_PATH` environment variable for both the **API** (value: `disco.api.json`) and **web** (value: `disco.web.json`).

---

Next:

[Open the **environment variables** page](/environment-variables){: .btn .btn-green .fs-5 }
