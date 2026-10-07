---
layout: page
title: Marketplace
parent: Abilities
nav_order: 7
summary: "Where abilities come from, and how local and cloud users get them."
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

Nothing loads just because it exists. You turn abilities on with `kaja abilities` locally, or on the
[Abilities page](https://kaja.io/agent/abilities) in the cloud. The two lists are separate.

Right now the marketplace has:

- **personas:** `care`, `barkochba`, `onboarding`
- **skills:** `system-report`, `meeting-notes`
- **HTTP tools:** `brave-search`, `open-meteo`
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
showing the picker), and with a background pull at startup when the last sync is over a day old. That one
applies on the next launch. You can turn both off in [`[marketplace]`](/configuration/config#marketplace).
To fetch from a fork, a branch or a local checkout, set [`[source]`](/configuration/abilities#source).

`kaja abilities` is a checklist of everything in the folder (space toggles, Enter saves). It writes
[`abilities.toml`](/configuration/abilities), and only what's listed there loads. Your own skills and
personas are the exception: they always load, and the picker lists them apart (rename or move the file to
switch one off). Your own tools and MCP servers are in the checklist like the rest. Anything that needs a key asks for it, and a stdio MCP server shows its command before you
enable it. A file that fails to load is skipped with the reason and never stops the rest.

Local mode is the most permissive: skills with scripts, stdio MCP servers and hosts on your own network all
work, because everything runs on your machine.

## In the cloud

The Kaja API keeps its own copy of the marketplace, refreshed every hour. You pick what your account uses:

- on the [Abilities page](https://kaja.io/agent/abilities) of the [web app](/using/web-app), which shows
  each ability's instructions, host, tools and key need before you turn it on;
- or with `/abilities` in the [cloud Telegram bot](/using/telegram#cloud-bot).

In cloud mode, `kaja abilities` just points you to the web page. A change reaches a running conversation
from its next message.

The cloud has no shell and serves many people, so it offers less:

| Kind | Not offered in the cloud when |
| --- | --- |
| skill | it has a `scripts/` folder |
| HTTP tool | its `baseUrl` isn't a public address |
| MCP server | it has no `tools` allowlist, isn't on a public host, or is `stdio` and needs a key ([keyless `stdio` ones run in the MCP sandbox](/abilities/mcp#in-the-cloud)) |

**Keys.** An ability that needs a key asks for it before you can turn it on. Kaja tests the key, stores it
encrypted and never shows it again: the page only says "Key saved", with Replace and Remove. It's used for
your own turns only and never reaches your terminal. Removing it turns off an ability that can't work
without it. Some abilities, like web search (`brave-search`), come with a key from the server, so you
need none. If you add your own, it's used instead.

**Approvals.** A call that could change something waits for you: the terminal asks, and the Telegram bot
shows Approve and Decline buttons. The server runs the exact call it saved, so a client can only say yes or
no. Writing a message instead of answering skips the call.

**Widgets** get skills only, chosen per widget key, so a site's visitors never make a call with your keys.
Every persona in the catalog is available to them.

The `default` persona is always on, and datasets come with the personas that use them, so neither is listed.

## Adding to the marketplace

Only the repo owner adds entries, by committing under `marketplace/` (a merged pull request counts). To try
one first:

1. Put it in a copy of the repo, following the
   [marketplace README](https://github.com/SubZtep/kaja/blob/main/marketplace/README.md).
2. Point [`[source]`](/configuration/abilities#source) at that copy, run `kaja abilities update`, and enable
   it with `kaja abilities`.
3. `kaja doctor` lists every loaded tool, and anything left out and why.

Once it's merged, local users get it with their next update and the cloud within the hour. How the syncing
works is on [Marketplace internals](/development/marketplace).

---

Next:

[Configuration](/configuration){: .btn .btn-green .fs-5 }
