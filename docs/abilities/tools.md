---
layout: page
title: Tools
parent: Abilities
nav_order: 4
summary: "Built-in tools, HTTP APIs, shell commands and your own."
---

# Tools

Every session starts with the built-in toolset. HTTP tools from the marketplace, [MCP servers](/abilities/mcp)
and, locally, code tools (an ability's `tool.ts`) are added on top.

## Built-ins

| Tool | Purpose | Cloud |
| --- | --- | :---: |
| `ask_user` | ask a clarifying question mid-task | ✓ |
| `switch_persona` | change [persona](/abilities/personas) mid-conversation | ✓ |
| `load_skill` | read an enabled [skill](/abilities/skills) | ✓ |
| `current_time` | current date and time | ✓ |
| `fetch_url` | fetch a URL | proxy |
| `summarize` | summarize long text | ✓ |
| `rerank` | rerank passages against a query | ✓ |
| `remember_note` / `recall_memory` / `forget_note` / `list_notes` | long-term [memory](/abilities/memory) | ✓ |
| `dataset_info` | collect answers for a persona's [dataset](/abilities/memory#datasets) | ✓ |
| `generate_image` | text-to-image | ✓ |
| `read_file` / `list_files` | read a file, list a directory | client |
| `view_image` | look at an image file | ✗ |
| `run_command` | run a shell command | ✗ |

Locally, `generate_image` needs a model listing `image-generation` in
[`models.toml`](/configuration/models).

Web search isn't built in. Turn on the marketplace's `brave-search` [HTTP tool](#http-tools) to get
`web_search`: locally with your own Brave Search API key, in the cloud with the server's key (or yours, if
you save one).

In the cloud, `read_file` and `list_files` pause the turn so your terminal can run them on your machine,
limited to the folder you started in. The widget and the cloud Telegram bot have no such client, so they
don't get these two.

`fetch_url` runs from your own machine and IP in local mode. In the cloud it goes through the server's
proxy, and is left out entirely if the server has none.

The **Cloud** column is an explicit allowlist. Anything that touches the server's filesystem or shell is
never exposed there, and code tools are never attached.

## HTTP tools

An HTTP tool describes one web API in TOML: where it lives, how it authenticates, and the calls the model can
make. It's the `tool.toml` of an ability folder, `~/.config/kaja/marketplace/abilities/<name>/tool.toml`,
synced from the marketplace or written by you. A chat gets it while a persona that lists it is active (see
[Personas](/abilities/personas#abilities)).
The folder name is the ability's name, so the file has no `name` of its own.

```toml
# abilities/github-issues/tool.toml
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

- `{name}` placeholders in `path` are filled from the arguments and URL-encoded, so they can't change the
  host. The other arguments go in the query string for GET and DELETE, or in a JSON body for POST, PUT and
  PATCH.
- `auth` puts the key in a header or query parameter (`in`), with an optional `prefix`. Locally the key
  lives in `secrets.toml` as `[abilities.github-issues] api_key = "..."`, and without it the ability is left
  out with a warning. An optional `check` request lets Kaja test a key before saving it.
- **GET runs straight away. Anything else shows the request** (method, URL, body) and waits for your
  approval, like a shell command. In the cloud you can also approve the tool for the rest of the chat.
- The model gets the status line and the body, cut at about 32 KB. Error statuses come back the same way, so
  the model can react. Redirects to another host are refused, and the key never appears in what the model
  sees.
- Locally, a tool may call hosts on your own network (Home Assistant, a NAS, Ollama).

The marketplace has two: `brave-search` adds `web_search` through the Brave Search API (the key goes in the
`X-Subscription-Token` header, and `kaja doctor` asks for it), and `open-meteo` looks up weather.

In the cloud, marketplace HTTP tools work in cloud chat and the cloud Telegram bot, unless the `baseUrl` is a
private or local address. Requests go through the server's proxy when it has one, and private addresses are
refused either way, on every redirect too. Keys and approvals work as described in
[Abilities in the cloud](/abilities/marketplace#in-the-cloud).

## Shell commands

`run_command` asks first, except for simple read-only commands on the [safe list](/configuration/config#commandstoml-commands-that-run-without-asking) (`ls`, `pwd`, `git status`, and the like), which you can edit. Known-risky patterns get a louder warning, and never skip the question:

- `rm -rf` (any flag order, and the long form `--recursive --force`)
- `sudo`, `mkfs`, writes to `/dev/sd*`
- `git push --force`, `git reset --hard`
- `DROP TABLE` / `DROP DATABASE`
- recursive `chmod`/`chown` on `/`
- fork bombs

A safe-list command still asks when it names a `secrets.toml` or anything under `.ssh`. Kaja keeps the first 64 KB of a command's output and error streams, and stops a command that runs longer than 15 seconds.

This is a **warning, not a sandbox**. The command runs with your own shell permissions, so read what you're
approving.

## Code tools

Local mode only. An ability folder's `tool.ts` (`~/.config/kaja/marketplace/abilities/<name>/tool.ts`) exports
tool objects. Every export with a `definition` and an `execute` function is picked up on the next start, with
no rebuild, beside the folder's other parts (a `SKILL.md` that explains when to use them, say):

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

`execute` returns a string, or `{ text, images?, displayImage? }` when the result includes images. A file
that throws on import is logged and skipped.

## Names and origins

All tools share one list of names, and each is marked by where it comes from:

| Origin | What |
| --- | --- |
| official | Kaja's built-ins |
| community | [abilities](/abilities), synced or your own, code tools included |

Official names are reserved: an MCP or code tool called `read_file` is left out instead of replacing the
built-in. Among the others, the first tool with a name keeps it.
`kaja doctor` lists every tool by origin, plus anything left out and why. The model only sees the names.

---

Next:

[MCP servers](/abilities/mcp){: .btn .btn-green .fs-5 }
