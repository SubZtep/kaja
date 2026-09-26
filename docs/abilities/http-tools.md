---
layout: page
title: HTTP tools
parent: Abilities
nav_order: 5
---

# HTTP tools

An HTTP tool describes one web API in TOML: where it lives, how it authenticates, and the tools the
model can call. It lives in `~/.config/kaja/marketplace/tools/<name>.toml`, synced from the marketplace
or written by you, and loads once you turn it on (see [Abilities](/abilities)).

```toml
name = "github-issues"                  # must match the file name
description = "Read and create GitHub issues"
baseUrl = "https://api.github.com"
auth = { type = "apiKey", in = "header", name = "Authorization", prefix = "Bearer " }
headers = { Accept = "application/vnd.github+json" }

[[tools]]
name = "create_issue"
description = "Open an issue in a repository"
method = "POST"                         # GET (default), POST, PUT, PATCH or DELETE
path = "/repos/{owner}/{repo}/issues"

[tools.parameters]                      # JSON Schema, passed to the model as-is
type = "object"
required = ["owner", "repo", "title"]

[tools.parameters.properties.owner]
type = "string"

[tools.parameters.properties.repo]
type = "string"

[tools.parameters.properties.title]
type = "string"
```

- `{name}` placeholders in `path` are filled from the arguments, URL-encoded, so they can't change the
  host. The other arguments go to the query string for GET and DELETE, or a JSON body for POST, PUT and
  PATCH.
- `auth` puts the key in a header or query parameter (`in`), with an optional `prefix`. Locally the key
  lives in `secrets.toml` as `[abilities.github-issues] api_key = "..."`; without it the ability is left
  out with a warning. An optional `check` request lets Kaja test a key before saving it.
- **GET runs straight away. Anything else shows the request** (method, URL, body) and waits for your
  approval, like a shell command.
- The model gets the status line and the body, cut at about 32 KB. Error statuses come back the same
  way, so the model can react. Redirects to another host are refused, and the key never appears in
  what the model sees.
- Locally a tool may call hosts on your own network (Home Assistant, a NAS, Ollama).

The marketplace's `brave-search` is a keyed example: it adds `web_search` through the Brave Search API,
with the key sent as the `X-Subscription-Token` header. Turn it on in `kaja abilities`, which asks for
the key.

## In the cloud

Marketplace HTTP tools work in cloud chat and the cloud Telegram bot, never one whose `baseUrl` is a
private or local address. Requests go through the server's proxy when it has one; either way private
addresses are refused, on every redirect too. Keys and approvals work as described on
[Abilities in the cloud](/abilities#in-the-cloud).

---

Next:

[MCP servers](/abilities/mcp){: .btn .btn-green .fs-5 }
