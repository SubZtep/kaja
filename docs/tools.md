---
layout: page
title: Tools
nav_order: 8
---

# Tools

Every session starts with the built-in toolset. In [local mode](/modes) that's joined by whatever
HTTP tools, MCP servers and plugin tools you've configured; in the cloud, by the marketplace HTTP
tools and MCP servers you turned on ([HTTP tools in the cloud](#http-tools-in-the-cloud),
[MCP servers in the cloud](#mcp-servers-in-the-cloud)).

## Built-ins

| Tool | Purpose | Cloud |
| --- | --- | :---: |
| `ask_user` | ask a clarifying question mid-task | ✓ |
| `switch_persona` | change [persona](/personas) mid-conversation | ✓ |
| `current_time` | current date and time | ✓ |
| `fetch_url` | fetch a URL | proxy |
| `summarize` | summarize long text | ✓ |
| `rerank` | rerank passages against a query | ✓ |
| `remember_note` / `recall_memory` / `forget_note` / `list_notes` | long-term [memory](/memory) | ✓ |
| `dataset_info` | collect structured answers for a persona's [dataset](/memory#datasets) | ✓ |
| `web_search` | Brave web search | ✓ |
| `generate_image` | text-to-image | ✓ |
| `read_file` / `list_files` | read a local file, list a directory | ✗ |
| `view_image` | look at an image file | ✗ |
| `run_command` | run a shell command | ✗ |

Two are conditional even locally: `web_search` needs `[webSearch]` in
[`secrets.toml`](/configuration/secrets), and `generate_image` needs a `[models.image-generation]`
entry in [`models.toml`](/configuration/models).

`fetch_url` is always available locally, where it fetches from your own machine. Cloud turns
egress from the server instead, so it appears only when the server sets `WEB_PROXY` — with
no proxy configured it is left out of the cloud toolset entirely, rather than fetching directly.

`WEB_PROXY` applies to cloud turns only. Local fetches go out directly from your own machine,
under your own IP, whether or not a proxy is configured on the server — so a page you fetch in
local mode sees your address, and the proxy provider's dashboard records nothing. Use
`kaja --cloud` if you want the fetch to leave through the server's proxy.

The **Cloud** column is an explicit allowlist, not a side effect — anything touching your
filesystem or shell is unavailable when the loop runs on the server, and your `mcp.toml` servers and
plugin tools are never attached there. Marketplace HTTP tools and remote MCP servers are the
exception, and only the ones you turn on.

## Shell commands

`run_command` always asks before running. Known-risky patterns get a louder warning:

- `rm -rf` (in any flag order, and the long-form `--recursive --force`)
- `sudo`, `mkfs`, writes to `/dev/sd*`
- `git push --force`, `git reset --hard`
- `DROP TABLE` / `DROP DATABASE`
- recursive `chmod`/`chown` on `/`
- fork bombs

This is an **advisory cue, not a sandbox**. The command runs with your own shell permissions —
read what you're approving.

## MCP servers

Add a server to `~/.config/kaja/mcp.toml` and its tools are folded in automatically — local
(stdio, needs `command`) or remote (Streamable HTTP, needs `url`):

```toml
[[servers]]
id = "location"
url = "https://ip2geo.demo.land/mcp"

[[servers]]
id = "context7"
command = "bunx"
args = ["-y", "@upstash/context7-mcp"]
```

The `location` server ships enabled; `chrome-devtools` and `context7` ship commented out. A server
that fails to connect is logged and skipped — the session still starts, just without its tools. The
startup panel shows each connected server and how many tools it contributed.

Needs a header or env var with a secret? Put it in [`secrets.toml`](/configuration/secrets) under
`[mcp.<id>]`, keyed by that server's `id`:

```toml
[mcp.location]
Authorization = "Bearer guest"
```

Values fold into the server's `env` (stdio) or `headers` (HTTP) by key name.
List the ones a server can't work without in its entry, and `kaja doctor` asks for any that are
missing and tests the server once they're all set:

```toml
[[servers]]
id = "context7"
command = "bunx"
args = ["-y", "@upstash/context7-mcp"]
secrets = ["CONTEXT7_API_KEY"]
```

### MCP packages

An MCP server can also come as a package, picked with `kaja pkg` like skills and HTTP tools. It lives
in `~/.config/kaja/marketplace/mcp/<name>.toml` and loads when listed in `packages.toml`
(`mcp = ["context7"]`):

```toml
name = "context7"
description = "Up-to-date library docs"
transport = "http"                  # http (Streamable HTTP), sse, or stdio
url = "https://mcp.context7.com/mcp"
auth = { type = "apiKey", in = "header", name = "Authorization", prefix = "Bearer ", optional = true }
tools = ["resolve-library-id", "query-docs"]   # optional: only these reach the model
approval = "never"                  # never | writes | always
```

- A `stdio` package runs a local command instead of a `url` (`command`, `args`, `env`), and its key
  goes in an env var (`in = "env"`). `kaja pkg` shows the command and asks before enabling one.
- The key lives in `secrets.toml` as `[packages.<name>] apiKey`, like HTTP tools. `optional = true`
  means the server works without one too.
- `approval = "writes"` asks before any tool the server doesn't mark read-only; `always` asks before
  every call. For a server that forgets to mark its read-only tools, list them in `readOnly`, with
  the arguments that turn a call into a write:

  ```toml
  readOnly = [
    "list_pages",                                    # always a read
    { tool = "take_screenshot", unless = ["filePath"] }, # a read, unless it saves a file
  ]
  ```
- All servers, packages and `mcp.toml` ones, connect in parallel at startup; one that doesn't answer
  within 10 seconds is skipped with a warning instead of holding up the start.

### MCP servers in the cloud

Marketplace MCP packages work in cloud chat and the cloud Telegram bot too. They sit in the Tools tab
of the [Packages page](https://kaja.io/packages), marked "MCP server", with their host, key need,
tool list and when they ask first. Keys, egress and approvals work as for
[HTTP tools in the cloud](#http-tools-in-the-cloud); on top of that:

- Only remote servers (`http` or `sse`) with a `tools = [...]` list: you see exactly what a server can
  do before turning it on, and it can't add tools later. `stdio` packages stay local.
- A saved key is tested by connecting and listing the server's tools.
- Each turn connects your servers when it starts (in parallel, giving up on one after 5 seconds) and
  closes them when it ends; nothing is kept between turns or shared with other users.
- The manifest's `approval` and `readOnly` apply, so a `writes` server asks before anything that
  changes something. Image results are left out with a note, and long results are cut at about 32 KB.
- A server that works without a key (like context7) is shared by everyone on the server's IP and its
  rate limits; add your own key to get yours.

## Your own tools

Drop a `.ts` file under `~/.config/kaja/tools/` that exports a tool object — every export with a
`definition` and an `execute` function is picked up on the next start, no rebuild:

```ts
export const diceTool = {
  definition: {
    type: "function",
    function: {
      name: "roll_dice",
      description: "Roll an n-sided die",
      parameters: {
        type: "object",
        properties: { sides: { type: "number" } },
        required: ["sides"]
      }
    }
  },
  execute: async ({ sides }: { sides: number }) => String(1 + Math.floor(Math.random() * sides))
}
```

`execute` returns a string, or `{ text, images?, displayImage? }` when the result includes images.
A file that throws on import is logged and skipped.

## HTTP tools

An HTTP tool package describes one web API in TOML: where it lives, how it authenticates, and the
tools the model can call. Packages live in `~/.config/kaja/marketplace/tools/<name>.toml`, synced
from the marketplace or written by you, and load only when listed in `packages.toml`
(`tools = ["open-meteo"]`, or pick them with `kaja pkg`):

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

- `{name}` placeholders in `path` are filled from the arguments, URL-encoded, so they can't change
  the host. The other arguments go to the query string for GET and DELETE, or a JSON body for POST,
  PUT and PATCH.
- `auth = { type = "apiKey", ... }` puts the key in a header or query parameter (`in`), with an
  optional `prefix`. The key lives in `secrets.toml` as `[packages.github-issues] apiKey = "..."`;
  `kaja pkg` asks for it when you enable the package. Without a key the package is left out, with a
  warning.
- GET tools run straight away. Anything else shows the request (method, URL, body) and waits for
  your approval, in the terminal and in Telegram, like a shell command.
- The model gets the status line and the body, cut at about 32 KB. Error statuses come back the same
  way, so the model can react. Redirects to another host are refused, and the key never appears in
  what the model sees.
- In local mode a package may call hosts on your own network (Home Assistant, a NAS, Ollama).

### HTTP tools in the cloud

Cloud chat and the cloud Telegram bot can use marketplace HTTP tools too. Turn them on in the Tools
tab of the [Packages page](https://kaja.io/packages), which shows each one's host, whether it needs
your key, and every tool with its method before you turn it on.

- Only marketplace packages, and never one whose `baseUrl` is a private or local address. Requests
  go through the server's `WEB_PROXY` when it's set, otherwise straight from the server; either way
  private addresses are refused, on every redirect too.
- A tool that needs a key asks for it first. The key is tested with the manifest's `check` request,
  stored encrypted (AES-256-GCM, with `USER_SECRET_KEY` on the server) and never shown again: the
  page only says "Key saved", with Replace and Remove. It stays when you turn the tool off; removing
  it turns off a tool that can't work without it. Your keys are only ever used for your own turns,
  and never reach the CLI.
- Anything but GET waits for your approval: `kaja --cloud` asks in the terminal, the Telegram bot
  sends Approve/Decline buttons. The server runs the call it saved when the model asked, so a client
  can only say yes or no. Writing a message instead of answering skips the call.
- Widget keys stay skills-only, so a site's visitors never call anything with your key.
- If the server has no `USER_SECRET_KEY`, key entry is off and tools that need a key are hidden.

## Names and origins

All tools share one list of names, and each one is marked by where it comes from:

| Origin | What |
| --- | --- |
| official | Kaja's built-ins, including `load_skill` |
| community | packages in `~/.config/kaja/marketplace/`, synced or your own |
| third-party | MCP servers from `mcp.toml` and your `tools/*.ts` files |

Official names are reserved: an MCP or plugin tool called `read_file` is left out rather than
replacing the built-in. Between the others, community tools come before third-party ones, and the
first tool with a name keeps it. `kaja doctor` lists every tool by origin, plus anything left out and
why. The model only sees the names, never the origin.

---

Next:

[Memory](/memory){: .btn .btn-green .fs-5 }
