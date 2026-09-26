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
- **S3-compatible object storage** for session and tool images (`STORAGE_*`). Production
  uses [Hetzner Object Storage](https://www.hetzner.com/storage/object-storage); see
  [Object storage](#object-storage).
- **SMTP server** for authentication emails (`SMTP_*`). Production uses [Brevo](https://www.brevo.com).
- **Outbound HTTP(S) proxy** for the cloud `fetch_url` tool (`WEB_PROXY`); without one the tool is
  left out of cloud turns. Production uses [Webshare](https://www.webshare.io).
- **Server-wide ability keys** (`ABILITY_KEYS`, `name=key` pairs separated by commas), shared by every
  cloud user. Production sets one for web search: `brave-search=` with a
  [Brave Search API](https://api-dashboard.search.brave.com) key.

Every outside service that receives users' data is listed in the [Privacy Policy](/privacy#sharing-data)
— add, remove or swap a provider there too.

## Projects

Create a Disco **Project** per app and point each at its own config file (the sandbox goes on its own
server, see [MCP sandbox](#mcp-sandbox)):

| Project | Variable | Value |
| --- | --- | --- |
| API | `DISCO_JSON_PATH` | `apps/api/disco.json` |
| Web | `DISCO_JSON_PATH` | `apps/web/disco.json` |
| Sandbox | `DISCO_JSON_PATH` | `apps/sandbox/disco.json` |

Install and attach the **PostgreSQL addon** to the API project — it creates `DATABASE_URL`
automatically. To keep its data on a Hetzner Volume that outlives the server, follow
[Postgres on a volume](/development/deploy-volume).

The API config declares a `hook:deploy:start:before` step that runs `bun run migrate.js`, so
**migrations apply on every deploy** before the new container takes traffic. The API keeps no files
of its own: everything lives in Postgres, and images in [object storage](#object-storage).
`compose.yaml` is for local development only.

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

### Object storage

Session images, and the images tools return in cloud turns, go to a Hetzner Object Storage bucket, never
to Postgres. Set it up once in the [Hetzner Cloud Console](https://console.hetzner.cloud/):

1. Create a bucket in the same location as the API server (`fsn1`, `nbg1` or `hel1`). Keep it **private**:
   clients only ever get signed URLs that expire after an hour.
2. Under **Security → S3 credentials**, create a key pair.
3. On the API project, set `STORAGE_BUCKET`, `STORAGE_REGION` (default `fsn1`), `STORAGE_ACCESS_KEY_ID`
   and `STORAGE_SECRET_ACCESS_KEY`. Leave `STORAGE_ENDPOINT` unset: it points the API at another
   S3-compatible server (the compose RustFS in dev, tests and CI) instead of Hetzner.

The API sets the bucket's lifecycle rule itself on every boot: objects under `tool-images/` expire after
1 day. Hetzner has no console setting for this; it only takes rules through the S3 API, which the API uses
anyway. A tool image from a turn that starts a new session is stored there, because the session has no id
until the turn is saved; the saved session keeps its own copy under `images/`. If the rule can't be set, the
API still starts and reports it to Sentry, and those copies just stay until someone deletes them.

The API won't start without the storage variables. Objects live under `images/<userId>/<sessionId>/<sha256>`.
Deleting a session removes its folder, and deleting a user removes both of their prefixes. Recreating
the database doesn't empty the bucket, so empty it too (see below), or its old images just sit there unused.

#### Deleting images by hand

The Hetzner console can't delete by prefix, so use any S3 client: the AWS CLI, `mc` or s3cmd. With the
AWS CLI, list first, then delete:

```sh
export AWS_ACCESS_KEY_ID=<STORAGE_ACCESS_KEY_ID> AWS_SECRET_ACCESS_KEY=<STORAGE_SECRET_ACCESS_KEY>
aws s3 ls s3://<bucket>/tool-images/ --recursive --endpoint-url https://fsn1.your-objectstorage.com
aws s3 rm s3://<bucket>/tool-images/ --recursive --endpoint-url https://fsn1.your-objectstorage.com
```

Use your bucket's location in the endpoint (`fsn1`, `nbg1` or `hel1`).

- `tool-images/` is always safe to delete. It only holds display copies, the saved sessions keep their own,
  and their signed URLs expire after an hour anyway. Do it when the expiry rule couldn't be set, which the
  API reports on boot.
- `images/` holds the sessions' real images; a deleted one shows as "[an image that is no longer
  stored]". Empty it (`s3://<bucket>/` as a whole) only when you also recreate the database.

Locally, the same commands work against the compose RustFS with `--endpoint-url http://localhost:9000` and
the dev credentials from `apps/api/.env.example`. Its console, at <http://localhost:9001> with the same
credentials, can delete a folder too.

### MCP sandbox

The sandbox (`apps/sandbox`) runs stdio MCP servers for cloud turns, starting with a headless Chrome. Its
browsers go out through the sandbox's own egress proxy, which only connects to public addresses (no
loopback, private ranges or the cloud metadata service). Still deploy it as its own project on a **separate
Disco server** with nothing else on it, so a gap in that proxy can't reach the database or the other projects.
The server must be amd64: the Chrome headless shell has no Linux arm64 build.

- Set the same `SANDBOX_SECRET` (`openssl rand -base64 32`) on the sandbox and the API project.
- Set the API's `SANDBOX_URL` to the sandbox's public HTTPS URL. `/mcp/*` and `/stats` only accept an
  API-signed token; `/health` is open. Admins see the sandbox live on the web's **Admin → Dashboard**.
- Optionally set `WEB_PROXY` (`http://` only, same format as the API's) so the browsers' traffic leaves
  through that proxy instead of the sandbox server's own IP; it must allow `CONNECT` to IPs on any port.
- Errors go to the sandbox's own Sentry project (DSN in `apps/sandbox/src/report.ts`), only in production;
  the image sets `NODE_ENV=production`. It reports MCP servers that won't start, die on their own, or error,
  with their last stderr lines; no tracing, and request headers are dropped.
- The image copies `marketplace/mcp` at build time, so a new or changed stdio manifest needs a sandbox
  redeploy too. A redeploy restarts every browser, so users lose the pages they had open.
- Size `SANDBOX_MAX_PROCESSES` (default 8) to the server's RAM: each Chrome takes about 300-500 MB. When
  it's full, the least recently used idle browser is stopped for the newcomer; only when every one is mid-call
  is a user turned away. The logs show each start, stop and refusal with the running count.

Without both `SANDBOX_URL` and `SANDBOX_SECRET` the API leaves stdio MCP abilities out of cloud turns.
How the sandbox works, including its egress proxy and settings, is in its
[README](https://github.com/SubZtep/kaja/tree/main/apps/sandbox#readme).

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

{% raw %}
```json
{ "log-driver": "journald", "log-opts": { "tag": "{{.Name}}" } }
```
{% endraw %}

Run `systemctl restart docker` (a brief outage) and redeploy every project — containers keep the log
driver they were created with. Every container should now report `journald`, and the oldest journal
entry should never be more than 31 days old:

{% raw %}
```sh
docker ps --format '{{.Names}}' | xargs -I{} docker inspect --format '{{.Name}} {{.HostConfig.LogConfig.Type}}' {}
journalctl -o short-iso | head -2
```
{% endraw %}

A `disco syslog:add` destination keeps its own copy under its own retention, so it would need a
matching limit and a line in the Privacy Policy.

## Production checklist

- A strong `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and real SMTP credentials.
- The storage bucket and its credentials (see [Object storage](#object-storage)).
- A strong `CONFIG_API_TOKEN`. `/config/*` is **fail-closed**: a missing or empty token returns 401
  for every request on the prefix and never serves provider API keys.
- `CORS_ORIGIN` matching the public web origin exactly. Note the [widget](/widget) routes are
  deliberately exempt — they reflect origins and gate on the key's own allowlist instead.
- `NODE_ENV=production` (Sentry on, no `/reference` UI).
- Rate limits left on — they only auto-disable under `bun test`.
- The same `SSR_SECRET` (`openssl rand -base64 32`) on both the API and the web project. Disco
  projects don't share a private network, so the web's `API_URL` is the public API URL. Without the
  secret, every visitor's server-side session check counts against the web host's IP, and busy pages
  start getting 429s (see [rate limits and the visitor's IP](/development/api#rate-limits-and-the-visitors-ip)).

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

[Postgres on a volume](/development/deploy-volume){: .btn .btn-green .fs-5 }
