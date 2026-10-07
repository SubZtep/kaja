---
layout: page
title: Marketplace
parent: Abilities
nav_order: 7
summary: "Where abilities come from, and how local and cloud users get them."
icon: 🛒
---

# Marketplace

Abilities come from the **marketplace**, a curated
[`marketplace/`](https://github.com/SubZtep/kaja/tree/main/marketplace) folder in the Kaja repo, and in local
mode also from files you write yourself.

| Kind | What it gives the agent | Read more |
| --- | --- | --- |
| persona | a character with its own instructions, model and sampling | [Personas](/abilities/personas) |
| skill | instructions it loads when a request matches | [Skills](/abilities/skills) |
| HTTP tool | a web API described so the model can call it | [HTTP tools](/abilities/tools#http-tools) |
| MCP server | the tools of a Model Context Protocol server | [MCP servers](/abilities/mcp) |
| dataset | questions a persona collects answers to | [Memory & datasets](/abilities/memory#datasets) |

Every ability is on, locally and in the cloud, and each [persona](/abilities/personas#abilities) decides
which of them a chat uses. There's nothing to turn on; an ability that needs a key waits for yours.

Right now the marketplace has:

- **personas:** `care`, `barkochba`, `onboarding`
- **skills:** `system-report`, `meeting-notes`
- **HTTP tools:** `web-search`, `open-meteo`
- **MCP servers:** `chrome-devtools`, `context7`, `geo-service`, `sequential-thinking`, `time`

## In local mode

`kaja abilities update` fetches the marketplace with `git` (2.25 or newer) and syncs it into
`~/.config/kaja/marketplace/`, next to your own abilities:

```ini
~/.config/kaja/marketplace/
├─ abilities/<name>/      # one folder per ability, any mix of:
│  ├─ SKILL.md            #   a skill (plus its other files and scripts/)
│  ├─ tool.toml           #   an HTTP tool
│  ├─ mcp.toml            #   an MCP server
│  └─ tool.ts             #   code tools (local only)
├─ personas/<id>.toml
└─ datasets/<id>.json
```

The sync never loses your edits:

- files you never touched follow the marketplace, removals included;
- a file you edited is replaced, and yours is saved beside it with `.bak` before the extension (`care.bak.toml`, then `care.bak.2.toml` and so on), so it keeps its highlighting and Kaja never loads it;
- a file the marketplace removed but you edited stays, as your own;
- files you added yourself are never touched.

Besides `kaja abilities update`, Kaja goes online on the first `kaja abilities` (it fetches once before
listing), and with a background pull at startup when the last sync is over a day old. That one applies on
the next launch. You can turn both off in [`[marketplace]`](/configuration/config#marketplace), which also
takes a `url` and `ref` to fetch from a fork, a branch or a local checkout.

Every valid ability and persona in the folder loads, your own included. `kaja abilities` lists them: each
ability's parts, whether its key is saved, the command a stdio MCP server runs, and the personas that use it.
To change what a chat gets, edit a persona's `abilities` list, or write your own persona (a new id, so the
sync never replaces it). `kaja doctor` asks for the keys of abilities a persona uses, and tests them. A file
that fails to load is skipped with the reason and never stops the rest.

Local mode is the most permissive: skills with scripts, stdio MCP servers and hosts on your own network all
work, because everything runs on your machine.

## In the cloud

The Kaja API keeps its own copy of the marketplace, refreshed every hour. Every account gets every persona in
it, and each persona's `abilities` list picks what a chat uses, the same as locally. A change reaches a
running conversation from its next message.

The cloud has no shell and serves many people, so it offers less:

| Kind | Not offered in the cloud when |
| --- | --- |
| skill | it has a `scripts/` folder |
| HTTP tool | its `baseUrl` isn't a public address |
| MCP server | it has no `tools` allowlist, isn't on a public host, or is `stdio` and needs a key ([keyless `stdio` ones run in the MCP sandbox](/abilities/mcp#in-the-cloud)) |

**Keys.** You save them under **API keys** on your [Profile](https://kaja.io/profile), which lists the
abilities your personas use that take one. Kaja tests the key, stores it encrypted and never shows it again:
the page only says "Key saved", with Replace and Remove. It's used for your own turns only and never reaches
your terminal. An ability that takes a key stays out of your chats until you add one, unless it also works
without one (like context7, where a key only raises the limits). Some abilities, like web search
(`web-search`), come with a key from the server, so you need none. If you add your own, it's used instead.

**Approvals.** A call that could change something waits for you: the terminal asks, and the Telegram bot
shows Approve and Decline buttons; both can also approve the tool for the rest of the chat. The server runs
the exact call it saved, so a client can only say yes or no. Writing a message instead of answering skips the
call.

**Widgets** get skills only, the ones the widget's persona lists, so a site's visitors never make a call with
your keys.

Datasets come with the personas that use them.

## Adding to the marketplace

Only the repo owner adds entries, by committing under `marketplace/` (a merged pull request counts). To try
one first:

1. Put it in a copy of the repo, following the
   [marketplace README](https://github.com/SubZtep/kaja/blob/main/marketplace/README.md).
2. Point [`[marketplace]`](/configuration/config#marketplace)'s `url` at that copy, run
   `kaja abilities update`, and list it in a persona's `abilities`.
3. `kaja doctor` lists every loaded tool, and anything left out and why.

Once it's merged, local users get it with their next update and the cloud within the hour. How the syncing
works is on [Marketplace internals](/development/marketplace).

---

Next:

[Configuration](/configuration){: .btn .btn-green .fs-5 }
