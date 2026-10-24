---
layout: page
title: MCP servers
parent: Abilities
nav_order: 5
summary: Plug in Model Context Protocol servers.
icon: 🔌
---

# MCP servers

A [Model Context Protocol](https://modelcontextprotocol.io) server adds its tools to the agent. A server is
an ability: an `mcp.toml` in its folder under `marketplace/abilities/`, synced from the marketplace or written
by you. Most work [in the cloud](#in-the-cloud) too.

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
auth = { type = "apiKey", in = "header", name = "Authorization", prefix = "Bearer ", keyless = true }
tools = ["resolve-library-id", "query-docs"]   # optional: only these reach the model
approval = "never"                  # never | writes | always
```

- A `stdio` ability starts a program on your machine instead of reaching a `url`, and its key goes in an env
  var (`in = "env"`). Most servers are packages, so name the package and Kaja picks a way to run it:

  ```toml
  # abilities/time/mcp.toml
  transport = "stdio"
  package = { pypi = "mcp-server-time@2026.10.19", docker = "mcp/time@sha256:9c46a9…" }
  args = []                           # the server's own arguments, after the package
  ```

  - `npm` packages run on Kaja itself (it has Bun built in, as `bunx`), with Node.js when you have it, so they
    need nothing installed.
  - `pypi` packages run with [uv](https://docs.astral.sh/uv/)'s `uvx`, else `pipx`.
  - `docker` images run with `docker run`, when nothing else can start the server. Env vars and the key go in
    by name (`-e NAME`), so they never show in the process list.

  Kaja tries them in that order. When none is installed, the ability is left out, and `kaja abilities` and
  `kaja doctor` say what to install. A server that isn't a package takes a `command` (with `args` and `env`)
  instead, and is left out the same way when that command isn't installed. `kaja abilities` shows what each
  one runs on your machine.

- `requires` names a program the server drives besides its runner. Today that's `chrome`, Google Chrome, which
  `chrome-devtools` opens (its stable channel, where Chrome installs itself on each OS). Without it the ability
  is left out too, and `kaja abilities` and `kaja doctor` say so, instead of the first tool call failing.
- The key lives in `secrets.toml` as `[abilities.<name>] api_key`. Every key is optional: without one the
  ability is simply off, and `kaja doctor` offers to add it. `keyless = true` means the server also works
  without one (like context7, where a key only raises the limits), so the ability stays on; `kaja doctor`
  still offers to add one.
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
- `roots = true` marks a stdio server that works in folders, like `filesystem`. It gets the active persona's
  folders (its entry's `roots`) as [MCP roots](https://modelcontextprotocol.io/specification/latest/client/roots),
  and new ones when you switch persona, without a restart. It's off for a persona that gives it none, and
  `kaja doctor` says so when no persona does. Run in Docker, every persona's folders are mounted at their own
  paths, and the active persona's roots narrow that down.

  ```toml
  # marketplace/personas/writer.toml (a persona of your own)
  abilities = [{ name = "filesystem", roots = ["~/notes", { path = "~/projects/site", readOnly = true }] }]
  ```

  In a read-only folder the server may only read. The server itself has no such setting, so Kaja refuses
  any call that may write there before it asks you, checking the arguments the manifest names in `pathArgs`
  (symlinks followed). The nearest folder decides, so a writable folder inside a read-only one stays writable.
  While some folder is read-only, those paths must be absolute or `~/…`. A persona whose folders are all
  read-only doesn't get the server's writing tools at all. In Docker, a folder every persona marks read-only
  is also mounted read-only. A manifest without `pathArgs` can't be checked, so its read-only folders are
  left out.

  With `{ path = "~/.config/hypr", backup = true }`, Kaja copies a file there before any call that may change
  it (found through `pathArgs` too) to its own data folder, at `backups/<the file's full path>/<time>`
  (`kaja config paths` shows where), and keeps every copy. If the copy fails, the call doesn't run. As
  with read-only folders, paths must then be absolute or `~/…`. A persona with a backed-up folder also gets
  `list_backups` and `restore_backup`; a restore asks first and backs up the file it replaces, so it can be
  undone too.

- `localOnly = true` keeps a server off the cloud's own hosts: it only ever runs on your own machine (in cloud
  chat, through your terminal). A `roots` one is local-only too.
- `toolDescriptions` says in a line what each listed tool does. The web app shows it, since a server's own
  descriptions only arrive once it runs:

  ```toml
  [toolDescriptions]
  "resolve-library-id" = "Finds a library's Context7 id from its name."
  "query-docs"         = "Fetches current documentation and code examples for a library."
  ```

## On a sandbox, from local mode

In local mode a `stdio` ability can run on a Kaja sandbox instead of your machine: handy when its runner
(`uvx` for a Python package) or Chrome isn't installed here, or when you'd rather keep a browser off it. Set
it in [`settings.toml`](/config/settings#toolshosts):

```toml
[tools.hosts]
chrome-devtools = "sandbox"
```

Its requests go through the Kaja API, so you need to be signed in (`kaja login`). The sandbox is picked the
same way as for cloud chat (below): your own, a shared one if you allow that, else Kaja's; `trustedSandbox`
and keyed abilities only your own or Kaja's. Your key from `secrets.toml` travels with each request and isn't
stored there. `kaja abilities` shows which abilities run on a sandbox. If the sandbox restarts, the next call
opens a new session (a browser's open pages are lost).

## In the cloud

Marketplace MCP abilities work in cloud chat and the cloud Telegram bot when they have a `tools` list (so
what a server can do is known up front, and it can't add tools later) and aren't local-only.

A `stdio` ability, like `chrome-devtools`, runs in a **sandbox**, never on the API's host, and a remote one's
requests go out through one too. In the terminal you can send one to your own computer instead
(`computer` in [`[tools.hosts]`](/config/settings#toolshosts)), and local-only ones always run there; see
[Your computer in cloud mode](/start/modes#your-computer-in-cloud-mode). That can be:

- Kaja's own sandbox;
- one you run yourself (`docker run subztep/kaja-sandbox`, with the key from the web app's Sandbox page);
- if you turn on **Use shared sandboxes**, one someone else shares. Whoever runs it can see what runs there.

Each user gets their own copy of the server, started on first use and kept warm between messages (a browser
keeps its open pages) until it's been idle for about 10 minutes. In someone else's sandbox it's stopped as
soon as the turn ends, so nothing (a login, say) stays there. The sandbox's browser can only reach public
websites, not Kaja's servers or anything on the sandbox's private network.

A manifest with `trustedSandbox = true` only runs in your own sandboxes or Kaja's, never in a shared one.
`chrome-devtools` is one, so the browser never runs on someone else's computer. A key travels with each
request and is never stored there, and goes only to Kaja's own sandbox. The same goes for HTTP tools.

- A turn connects the servers its persona lists, others after a persona switch, and closes them when it
  ends. Nothing is shared with other users.
- `approval` and `readOnly` work as above. Images, like screenshots, come back to you, and long results are
  cut at about 32 KB. An argument that would save a file on the server (`localOnlyArgs`, like a screenshot's
  `filePath`) is hidden in the cloud.
- A server that works without a key sees every user of a sandbox as one IP, with its rate limits, until
  Kaja adds a key.

Keys and approvals otherwise work as described in [Abilities in the cloud](/abilities/marketplace#in-the-cloud).

---

Next:

[Memory & datasets](/abilities/memory){: .btn .btn-green .fs-5 }
