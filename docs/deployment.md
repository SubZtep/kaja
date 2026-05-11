---
layout: page
title: Deployment
nav_order: 4
---

# Deployment

These are snippets of how [kaja.io](https://kaja.io) is deployed to its current environment. [Disco](https://disco.cloud) handles most deployment work — you push to `main` and the pipeline runs.

## Prerequisites

- [GitHub + Ubuntu 24.04](https://disco.cloud/docs/#prerequisites) — the publish webhook triggers deployment on the fully managed box. Even the smallest [Hetzner VPS](https://www.hetzner.com/cloud/cost-optimized) is more than enough to host several services and a database, as long as traffic stays reasonable.
- **SMTP server** is required for authentication. [Gmail’s SMTP](/send-email) works well for the traffic this host can handle.
- [MaxMind account](https://support.maxmind.com/knowledge-base/articles/create-a-maxmind-account#sign-up-for-geolite) for *GeoLite City* data to enable proper node routing.
- Ⱥį?

## Deploy

Install [Disco](https://disco.cloud/docs) on the server and configure it.

Create two **Projects** and add this additional **environment variable** to the [existing ones](/environment-variables) in the Disco interface:

| Project | Variable          | Value            |
| ------- | ----------------- | ---------------- |
| API     | `DISCO_JSON_PATH` | `disco.api.json` |
| Web     | `DISCO_JSON_PATH` | `disco.web.json` |

Install and attach the **PostgreSQL addon** to the API project.

> Automatic database migration is not needed right now — just run SQL updates directly. 🫪
{: .warning }
