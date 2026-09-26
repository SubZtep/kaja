---
layout: page
title: Abilities
nav_order: 4
has_children: true
---

# Abilities

Everything Kaja can do beyond its [built-in tools](/tools) is an **ability**: a persona, skill, HTTP
tool, MCP server or dataset. They come from the **marketplace**, a curated
[`marketplace/`](https://github.com/SubZtep/kaja/tree/main/marketplace) folder in the Kaja repo, and in
local mode from files you write yourself.

| Kind | What it gives the agent | Read more |
| --- | --- | --- |
| persona | a character with its own instructions, model and sampling | [Personas](/personas) |
| skill | instructions it loads when a request matches | [Skills](/skills) |
| HTTP tool | a web API described so the model can call it | [HTTP tools](/http-tools) |
| MCP server | the tools of a Model Context Protocol server | [MCP servers](/mcp) |
| dataset | questions a persona collects answers to | [Memory & datasets](/memory#datasets) |

Nothing loads just because it exists: you turn each ability on — with `kaja abilities` locally, or on
the [Abilities page](https://kaja.io/abilities) in the cloud. The two lists are separate.

## In local mode

`kaja abilities update` fetches the marketplace with `git` (2.25 or newer) and syncs it into
`~/.config/kaja/marketplace/`, next to your own abilities:

```ini
~/.config/kaja/marketplace/
├─ personas/<id>.toml
├─ skills/<name>/SKILL.md
├─ tools/<name>.toml      # HTTP tools
├─ mcp/<name>.toml        # MCP servers
└─ datasets/<id>.json
```

The sync never loses your edits:

- files you never touched follow the marketplace, including removals;
- a file you edited is replaced, and yours is saved beside it as `.bak` (`.bak2`, … if one exists);
- a file the marketplace removed but you edited stays, as your own;
- files you added yourself are never touched.

Besides `kaja abilities update`, the network is used by the first `kaja abilities` (it fetches once
before showing the picker) and by a background pull at startup when the last sync is over a day old;
changes from that apply on the next launch. Both can be turned off in
[`[marketplace]`](/configuration/config#marketplace). To fetch from a fork, a branch or a local
checkout, set [`[source]`](/configuration/abilities#source).

`kaja abilities` is a checklist of everything in the folder (space toggles, Enter saves). It writes
[`abilities.toml`](/configuration/abilities); only what's listed there loads, your own abilities
included. Anything that needs a key asks for it, and a stdio MCP server shows its command before you
enable it. A file that fails to load is skipped with the reason, and never stops the rest.

Local mode is the most permissive: skills with scripts, stdio MCP servers and hosts on your own network
all work, because everything runs on your machine.

## In the cloud

The Kaja API keeps its own copy of the marketplace, refreshed every hour. Pick what your account uses:

- on the [Abilities page](https://kaja.io/abilities) of the [web app](/web-app), which shows each
  ability's instructions, host, tools and key need before you turn it on;
- or with `/abilities` in the [cloud Telegram bot](/telegram#cloud-bot).

`kaja abilities` in cloud mode just points you to the web page. A change reaches a conversation that's
already going from its next message, in cloud terminal chat and the cloud Telegram bot alike.

The cloud has no shell and serves many people, so it offers less:

| Kind | Not offered in the cloud when |
| --- | --- |
| skill | it has a `scripts/` folder |
| HTTP tool | its `baseUrl` isn't a public address |
| MCP server | it has no `tools` allowlist, isn't on a public host, or is `stdio` and needs a key ([keyless `stdio` ones run in the MCP sandbox](/mcp#in-the-cloud)) |

**Keys.** An ability that needs a key asks for it before you can turn it on. The key is tested, stored
encrypted, and never shown again — the page only says "Key saved", with Replace and Remove. It's only
used for your own turns and never reaches the terminal. Removing it turns off an ability that can't
work without it. Some abilities, such as web search (`brave-search`), come with a key the server
provides, so they need none from you; your own key, if you add one, is used instead.

**Approvals.** A call that could change something waits for you: the terminal asks, the Telegram bot
shows Approve/Decline buttons. The server runs the exact call it saved, so a client can only say yes
or no. Writing a message instead of answering skips the call.

**Widgets** get skills only, chosen per widget key, so a site's visitors never make a call with your
keys. Every persona in the catalog is available to them.

The `default` persona is always on, and datasets come with the personas that use them, so neither is
listed.

## Adding to the marketplace

Only the repo owner adds entries, by committing under `marketplace/` (a merged pull request counts). To
try one before it's merged:

1. Put it in a copy of the repo, following the
   [marketplace README](https://github.com/SubZtep/kaja/blob/main/marketplace/README.md).
2. Point [`[source]`](/configuration/abilities#source) at that copy, run `kaja abilities update`, and
   enable it with `kaja abilities`.
3. `kaja doctor` lists every loaded tool, and anything left out and why.

Once merged, local users get it with their next update, and the cloud within the hour. How the syncing
works is on [Marketplace internals](/development/marketplace).

---

Next:

[Personas](/personas){: .btn .btn-green .fs-5 }
