---
layout: page
title: Built-in tools
parent: Abilities
nav_order: 3
---

# Built-in tools

Every session starts with the built-in toolset. [HTTP tools](/http-tools), [MCP servers](/mcp) and,
locally, your own plugin tools are added on top.

## Built-ins

| Tool | Purpose | Cloud |
| --- | --- | :---: |
| `ask_user` | ask a clarifying question mid-task | ✓ |
| `switch_persona` | change [persona](/personas) mid-conversation | ✓ |
| `load_skill` | read an enabled [skill](/skills) | ✓ |
| `current_time` | current date and time | ✓ |
| `fetch_url` | fetch a URL | proxy |
| `summarize` | summarize long text | ✓ |
| `rerank` | rerank passages against a query | ✓ |
| `remember_note` / `recall_memory` / `forget_note` / `list_notes` | long-term [memory](/memory) | ✓ |
| `dataset_info` | collect answers for a persona's [dataset](/memory#datasets) | ✓ |
| `generate_image` | text-to-image | ✓ |
| `read_file` / `list_files` | read a file, list a directory | client |
| `view_image` | look at an image file | ✗ |
| `run_command` | run a shell command | ✗ |

Locally, `generate_image` needs a `[models.image-generation]` entry in [`models.toml`](/configuration/models).

Web search isn't built in: turn on the marketplace's `brave-search` [HTTP tool](/http-tools), which adds
`web_search`: locally with your own Brave Search API key, in the cloud with the server's.

In the cloud, `read_file` and `list_files` pause the turn so the cloud-mode terminal can run them on
your machine, scoped to the directory you launched from. The widget and the cloud Telegram bot have
no such client, so they don't get these two.

`fetch_url` fetches from your own machine, under your own IP, in local mode. In the cloud it goes out
through the server's proxy, and is left out entirely when the server has none.

The **Cloud** column is an explicit allowlist: anything that touches the server's filesystem or shell
is never exposed there, and your `mcp.toml` servers and plugin tools are never attached.

## Shell commands

`run_command` always asks before running. Known-risky patterns get a louder warning:

- `rm -rf` (in any flag order, and the long-form `--recursive --force`)
- `sudo`, `mkfs`, writes to `/dev/sd*`
- `git push --force`, `git reset --hard`
- `DROP TABLE` / `DROP DATABASE`
- recursive `chmod`/`chown` on `/`
- fork bombs

This is an **advisory cue, not a sandbox**. The command runs with your own shell permissions — read
what you're approving.

## Your own tools

Local mode only. Drop a `.ts` file under `~/.config/kaja/tools/` that exports a tool object — every
export with a `definition` and an `execute` function is picked up on the next start, no rebuild:

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

## Names and origins

All tools share one list of names, and each one is marked by where it comes from:

| Origin | What |
| --- | --- |
| official | Kaja's built-ins |
| community | [abilities](/abilities), synced or your own |
| third-party | MCP servers from `mcp.toml` and your `tools/*.ts` files |

Official names are reserved: an MCP or plugin tool called `read_file` is left out rather than
replacing the built-in. Between the others, community tools come first, and the first tool with a name
keeps it. `kaja doctor` lists every tool by origin, plus anything left out and why. The model only sees
the names.

---

Next:

[HTTP tools](/http-tools){: .btn .btn-green .fs-5 }
