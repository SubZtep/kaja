---
layout: page
title: MCP servers
parent: Abilities
nav_order: 5
summary: "Plug in Model Context Protocol servers."
icon: 🔌
---

# MCP servers

A [Model Context Protocol](https://modelcontextprotocol.io) server adds its tools to the agent. A server is
an ability: an `mcp.toml` in its folder under `marketplace/abilities/`, synced from the marketplace or written
by you. It works in the cloud too when it's remote, or a stdio one the MCP sandbox runs.

A server connects when a [persona](/abilities/personas#abilities) that lists it becomes active, so one no
persona in the chat uses never starts. One that fails, or doesn't answer within 10 seconds, is skipped with a
warning, and the chat goes on without its tools. `kaja doctor` connects every server and shows each one's
tool count.

## MCP abilities

An MCP ability is the `mcp.toml` of an ability folder, `~/.config/kaja/marketplace/abilities/<name>/mcp.toml`
(the folder name is the ability's name, so the file has none):

```toml
# abilities/context7/mcp.toml
description = "Up-to-date library docs"
transport = "http"                  # http (Streamable HTTP), sse, or stdio
url = "https://mcp.context7.com/mcp"
auth = { type = "apiKey", in = "header", name = "Authorization", prefix = "Bearer ", optional = true }
tools = ["resolve-library-id", "query-docs"]   # optional: only these reach the model
approval = "never"                  # never | writes | always
```

The marketplace ships `chrome-devtools`, `context7`, `geo-service`, `sequential-thinking` and `time`.

- A `stdio` ability runs a local `command` (with `args` and `env`) instead of a `url`, and its key goes in an
  env var (`in = "env"`). `kaja abilities` shows the command it runs.
- The key lives in `secrets.toml` as `[abilities.<name>] api_key`. `optional = true` means the server also
  works without one.
- `approval = "writes"` asks before any tool the server doesn't mark read-only, and `always` asks before
  every call. If a server forgets to mark its read-only tools, list them in `readOnly`, with the arguments
  that turn a call into a write:

  ```toml
  readOnly = [
    "list_pages",                                        # always a read
    { tool = "take_screenshot", unless = ["filePath"] }, # a read, unless it saves a file
  ]
  ```

- A persona can narrow an ability to some of its tools with an entry's `tools` list (see
  [Personas](/abilities/personas#abilities)).
- `toolDescriptions` says in a line what each listed tool does. The web app shows it, since a server's own
  descriptions only arrive once it runs:

  ```toml
  [toolDescriptions]
  "resolve-library-id" = "Finds a library's Context7 id from its name."
  "query-docs"         = "Fetches current documentation and code examples for a library."
  ```

## In the cloud

Marketplace MCP abilities work in cloud chat and the cloud Telegram bot when they have a `tools` list (so
you can see what a server can do before turning it on, and it can't add tools later) and are either remote
(`http` or `sse`) or `stdio` without a key.

A `stdio` ability, like `chrome-devtools`, runs in an **MCP sandbox**, never on the API's host. That can be:

- Kaja's own sandbox;
- one you run yourself (`docker run subztep/kaja-sandbox`, with the key from the web app's Sandbox page);
- if you turn on **Use shared sandboxes**, one someone else shares. Whoever runs it can see what runs there.

Each user gets their own copy of the server, started on first use and kept warm between messages (a browser
keeps its open pages) until it's been idle for about 10 minutes. In someone else's sandbox it's stopped as
soon as the turn ends, so nothing (a login, say) stays there. The sandbox's browser can only reach public
websites, not Kaja's servers or anything on the sandbox's private network.

A manifest with `trustedSandbox = true` only runs in your own sandboxes or Kaja's, never in a shared one.
`chrome-devtools` is one, so the browser never runs on someone else's computer.
A `stdio` ability that needs a key stays local for now.

- A turn connects the servers its persona lists (giving up on one after 5 seconds), others after a persona
  switch, and closes them when it ends. Nothing is shared with other users.
- A saved key is tested by connecting and listing the server's tools.
- `approval` and `readOnly` work as above. Images, like screenshots, come back to you, and long results are
  cut at about 32 KB. An argument that would save a file on the server (`localOnlyArgs`, like a screenshot's
  `filePath`) is hidden in the cloud.
- A server that works without a key is shared by everyone on the Kaja server's IP, with its rate limits. Add
  your own key to get yours.

Keys and approvals otherwise work as described in [Abilities in the cloud](/abilities/marketplace#in-the-cloud).

---

Next:

[Memory & datasets](/abilities/memory){: .btn .btn-green .fs-5 }
