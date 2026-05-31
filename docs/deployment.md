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

If `uuidv7()` missing from the server, create it manually:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'uuidv7'
      AND pronargs = 0
      AND pg_function_is_visible(oid)
  ) THEN
    CREATE FUNCTION uuidv7()
    RETURNS uuid
    LANGUAGE plpgsql
    VOLATILE
    AS $fn$
    DECLARE
      ts bytea;
      rnd bytea;
    BEGIN
      ts := substring(
        int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint)
        FROM 3
      );

      rnd := gen_random_bytes(10);

      -- UUIDv7 version bits
      rnd := set_byte(rnd, 0, (get_byte(rnd, 0) & 15) | 112);

      -- UUID variant bits
      rnd := set_byte(rnd, 2, (get_byte(rnd, 2) & 63) | 128);

      RETURN encode(ts || rnd, 'hex')::uuid;
    END;
    $fn$;
  END IF;
END
$$;
```

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
