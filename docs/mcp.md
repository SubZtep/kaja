---
layout: page
title: MCP servers
parent: Abilities
nav_order: 6
---

# MCP servers

A [Model Context Protocol](https://modelcontextprotocol.io) server adds its tools to the agent. There
are two ways to add one:

- **`mcp.toml`** — your own servers, local mode only, loaded as soon as they're listed;
- **an MCP ability** — a manifest in the marketplace, turned on like any other [ability](/abilities),
  and usable in the cloud too when it's remote, or a stdio one the MCP sandbox runs.

All servers connect in parallel at startup; one that doesn't answer within 10 seconds, or fails to
connect, is skipped with a warning and the session starts without its tools. The startup panel shows
each connected server and its tool count.

## mcp.toml

Local (stdio, needs `command`) or remote (Streamable HTTP, needs `url`):

```toml
[[servers]]
id = "docs"
url = "https://docs.example.com/mcp"

[[servers]]
id = "context7"
command = "bunx"
args = ["-y", "@upstash/context7-mcp"]
secrets = ["CONTEXT7_API_KEY"]
```

Secret env vars and headers go in [`secrets.toml`](/configuration/secrets) under `[mcp.<id>]`, and fold
into the server's `env` (stdio) or `headers` (HTTP) by key name:

```toml
[mcp.docs]
Authorization = "Bearer <token>"
```

List the ones a server can't work without in `secrets`, and `kaja doctor` asks for any that are
missing, then tests the server.

The template's servers (`chrome-devtools`, `context7`) are commented out, so none is on by default.

## MCP abilities

An MCP ability lives in `~/.config/kaja/marketplace/mcp/<name>.toml`:

```toml
name = "context7"
description = "Up-to-date library docs"
transport = "http"                  # http (Streamable HTTP), sse, or stdio
url = "https://mcp.context7.com/mcp"
auth = { type = "apiKey", in = "header", name = "Authorization", prefix = "Bearer ", optional = true }
tools = ["resolve-library-id", "query-docs"]   # optional: only these reach the model
approval = "never"                  # never | writes | always
```

- A `stdio` ability runs a local `command` (with `args`, `env`) instead of a `url`, and its key goes in
  an env var (`in = "env"`). `kaja abilities` shows the command and asks before enabling one.
- The key lives in `secrets.toml` as `[abilities.<name>] api_key`. `optional = true` means the server
  works without one too.
- `approval = "writes"` asks before any tool the server doesn't mark read-only; `always` asks before
  every call. For a server that forgets to mark its read-only tools, list them in `readOnly`, with the
  arguments that turn a call into a write:

  ```toml
  readOnly = [
    "list_pages",                                        # always a read
    { tool = "take_screenshot", unless = ["filePath"] }, # a read, unless it saves a file
  ]
  ```

## In the cloud

Marketplace MCP abilities work in cloud chat and the cloud Telegram bot when they have a `tools` list —
so you see exactly what a server can do before turning it on, and it can't add tools later — and are
either remote (`http` or `sse`) or `stdio` without a key.

A `stdio` ability, such as `chrome-devtools`, runs in Kaja's **MCP sandbox**, a separate server, never on
the API's host. Each user gets their own copy of the server, started on first use and kept warm between
messages (a browser keeps its open pages) until it's been unused for about 10 minutes. The sandbox's
browser can only reach public websites: not Kaja's own servers, nor anything on a private network.
A `stdio` ability that needs a key stays local for now.

- Each turn connects your servers when it starts (giving up on one after 5 seconds) and closes the
  connection when it ends; nothing is shared with other users.
- A saved key is tested by connecting and listing the server's tools.
- `approval` and `readOnly` apply as above. Images, such as screenshots, come back to you, and long
  results are cut at about 32 KB. An argument that would save a file on the server (`localOnlyArgs`,
  like a screenshot's `filePath`) is hidden in the cloud.
- A server that works without a key is shared by everyone on the Kaja server's IP, with its rate
  limits; add your own key to get yours.

Keys and approvals otherwise work as described on [Abilities in the cloud](/abilities#in-the-cloud).

---

Next:

[Memory & datasets](/memory){: .btn .btn-green .fs-5 }
