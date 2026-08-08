---
layout: page
title: Tools
nav_order: 7
---

# Tools

Every chat session starts with the built-in toolset, plus whatever MCP servers and local plugin
tools (`~/.config/kaja/tools/*.ts`) you've added.

| Tool | Purpose |
| --- | --- |
| `read_file` / `list_files` | read local files, list a directory |
| `fetch_url` | fetch a URL |
| `view_image` | look at an image file |
| `summarize` | summarize long text |
| `rerank` | rerank passages against a query |
| `current_time` | current date/time |
| `ask_user` | ask a clarifying question mid-task |
| `run_command` | run a shell command |
| `switch_persona` | change [persona](/personas) mid-conversation |
| `remember_note` / `recall_memory` / `forget_note` / `list_notes` | long-term memory notes |
| `dataset_info` | collect structured answers for a persona's dataset |

Two more appear when configured: `web_search` (needs `[webSearch]` in
[`secrets.toml`](/configuration/secrets)) and `generate_image` (needs a `models.image-generation`
entry).

## Shell commands

`run_command` always asks before running. Known-risky patterns (`rm -rf`, `sudo`,
`git push --force`, `DROP TABLE`, fork bombs, …) get a louder warning — an advisory cue, not a
sandbox. It runs with your own shell permissions.

## MCP servers

Add a server to `~/.config/kaja/mcp.toml` and its tools are folded in automatically — local
(stdio, needs `command`) or remote (HTTP, needs `url`):

```toml
[[servers]]
id = "playwright"
command = "bunx"
args = ["@playwright/mcp@latest", "--isolated", "--headless"]

[[servers]]
id = "geo-service"
url = "https://your-geo-service-host/mcp"
```

Needs a header or env var with a secret in it? Add it to
[`secrets.toml`](/configuration/secrets) under `[mcp.<id>]`, keyed by that server's `id`:

```toml
[mcp.geo-service]
Authorization = "Bearer your-secret-api-key"
```

Playwright ships enabled by default, giving the agent a headless browser.

## Your own tools

Drop a `.ts` file exporting a tool under `~/.config/kaja/tools/` — picked up automatically, no
rebuild needed.

---

Next:

[Telegram](/telegram){: .btn .btn-green .fs-5 }
