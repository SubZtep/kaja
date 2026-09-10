---
layout: page
title: Tools
nav_order: 8
---

# Tools

Every session starts with the built-in toolset. In [local mode](/modes) that's joined by whatever
MCP servers and plugin tools you've configured.

## Built-ins

| Tool | Purpose | Hosted |
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

`fetch_url` is always available locally, where it fetches from your own machine. Hosted turns
egress from the server instead, so it appears only when the server sets `WEB_PROXY` — with
no proxy configured it is left out of the hosted toolset entirely, rather than fetching directly.

`WEB_PROXY` applies to hosted turns only. Local fetches go out directly from your own machine,
under your own IP, whether or not a proxy is configured on the server — so a page you fetch in
local mode sees your address, and the proxy provider's dashboard records nothing. Use
`kaja --remote` if you want the fetch to leave through the server's proxy.

The **Hosted** column is an explicit allowlist, not a side effect — anything touching your
filesystem or shell is unavailable when the loop runs on the server, and MCP and plugin tools are
never attached there.

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

---

Next:

[Memory](/memory){: .btn .btn-green .fs-5 }
