---
layout: page
title: Configuration
nav_order: 2
---

# Configuration

This section describe all the different configuration settings. Understand the different workspace's environments crutial for local development or deploy online.

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

---

Next:

[Open the **environment variables** page](/environment-variables){: .btn .btn-blue .fs-5 }
