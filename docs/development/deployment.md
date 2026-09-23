---
layout: page
title: Deployment
parent: Development
nav_order: 7
---

# Deployment

How [kaja.io](https://kaja.io) reaches its current environment.
[Disco](https://disco.cloud) does most of the work — push to `main` and the pipeline runs.

## Prerequisites

- [**GitHub + Ubuntu 24.04**](https://disco.cloud/docs/#prerequisites) — the publish webhook
  triggers deployment on the managed box. Even the smallest
  [Hetzner VPS](https://www.hetzner.com/cloud/cost-optimized) hosts several services and a database
  comfortably at modest traffic.
- **SMTP server** for authentication emails (`SMTP_*`). Production uses [Brevo](https://www.brevo.com).
- **Outbound HTTP(S) proxy** for the cloud `fetch_url` tool (`WEB_PROXY`); without one the tool is
  left out of cloud turns. Production uses [Webshare](https://www.webshare.io).

Every outside service that receives users' data is listed in the [Privacy Policy](/privacy#sharing-data)
— add, remove or swap a provider there too.

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

### Recreating the database

Until v1.0 a schema change means recreating the database (see
[Database](/development/database#how-the-schema-is-managed)): `migrate.ts` only creates what is missing, so
it can't repair an old table that changed shape.

Drop and recreate the schema **as the database user the API connects with**, or give it the schema
afterwards. Recreating `public` as an admin role leaves that role as its owner, and the API's own user then
fails the first migration with `no schema has been selected to create in`:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public AUTHORIZATION <user in DATABASE_URL>;
-- or, if it was already recreated as another role:
ALTER SCHEMA public OWNER TO <user in DATABASE_URL>;
```

Then deploy: the migrations and the config seed run before the new container takes traffic. Secrets users
saved before the recreate are gone with it.

## Environment variables

Docker builds omit `.env` files entirely. **No `.env*` file ships to production** — inject
variables on the server (Disco's UI, `docker --env-file` outside the image, k8s secrets). Every variable
is listed, with its purpose, in the generated `apps/*/.env.example`.

## Log retention

The [Privacy Policy](/privacy#retention) promises server logs are kept for **up to 30 days**. Disco
has no retention setting of its own (only `disco logs` and `disco syslog:*` forwarding), so the host
enforces it: Docker logs to journald, and journald deletes anything older than 30 days.

```sh
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/retention.conf <<'EOF'
[Journal]
Storage=persistent
MaxRetentionSec=30day
MaxFileSec=1day
EOF
systemctl restart systemd-journald
```

`MaxFileSec=1day` matters: journald only removes whole files, and one file otherwise spans up to a
month, so entries could outlive the limit by weeks.

Then merge into `/etc/docker/daemon.json`:

```json
{ "log-driver": "journald", "log-opts": { "tag": "{{.Name}}" } }
```

Run `systemctl restart docker` (a brief outage) and redeploy every project — containers keep the log
driver they were created with. Every container should now report `journald`, and the oldest journal
entry should never be more than 31 days old:

```sh
docker ps --format '{{.Names}}' | xargs -I{} docker inspect --format '{{.Name}} {{.HostConfig.LogConfig.Type}}' {}
journalctl -o short-iso | head -2
```

A `disco syslog:add` destination keeps its own copy under its own retention, so it would need a
matching limit and a line in the Privacy Policy.

## Production checklist

- A strong `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and real SMTP credentials.
- A strong `CONFIG_API_TOKEN`. `/config/*` is **fail-closed**: a missing or empty token returns 401
  for every request on the prefix and never serves provider API keys.
- `CORS_ORIGIN` matching the public web origin exactly. Note the [widget](/widget) routes are
  deliberately exempt — they reflect origins and gate on the key's own allowlist instead.
- `NODE_ENV=production` (Sentry on, no `/reference` UI).
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

[Back to the start](/){: .btn .btn-green .fs-5 }
