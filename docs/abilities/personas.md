---
layout: page
title: Personas
parent: Abilities
nav_order: 2
summary: "Characters with their own instructions and models."
icon: 🎭
---

# Personas

A persona is a named character the assistant can switch into: its own instructions, and optionally its own
model and sampling. Each one is a file, `~/.config/kaja/marketplace/personas/<id>.toml`, and the file name
is the persona's id.

Every persona in the folder loads, `default` first, and the persona picker shows the ones you added yourself
in a different colour; rename or move a file to switch it off. A fresh
install has `default` built in, and a `default.toml` in the folder (the marketplace brings one) replaces it.

```toml
label = "Self-care companion"
when = "the user talks about their day, feelings, mood, or personal struggles"
temperature = 0.3
instructions = """
You are a warm, grounded self-care companion.
Listen first. Reflect back what you heard before offering anything.
"""
```

| Field | Purpose |
| --- | --- |
| `label` | display name (required) |
| `instructions` | system-prompt text for this persona |
| `when` | short clause telling the model when to switch here on its own |
| `dataset` | id of a [dataset](/abilities/memory#datasets) this persona collects |
| `models` | a model id per task from your [`models.toml`](/configuration/models), like `chat = "reasoning-chat"` |
| `abilities` | the [abilities](/abilities) this persona uses, by name (see below). Unset means only the built-in tools |
| `localOnly` | `true` keeps the persona out of the cloud, for one whose abilities only work on your machine |
| sampling | `temperature`, `top_p`, `top_k`, `max_tokens`, `frequency_penalty`, `presence_penalty`, `seed` |

> Kaja already tells the model to ask questions through `ask_user` and how to collect a dataset. Don't
> repeat either in `instructions`.
{: .note }

## Abilities

A persona's `abilities` list decides which skills, HTTP tools, MCP servers and code tools the model gets while
it's active. Built-in tools (files, memory, `ask_user` and the rest) don't depend on it. A name uses every part
of that ability; a table tweaks one:

```toml
abilities = [
  "web-search",                                    # every part of the ability
  { name = "chrome-devtools", tools = ["navigate_page", "take_screenshot"] },  # only these tools
  { name = "meeting-notes", skill = "sticky" },    # the skill's instructions stay in the system prompt
  { name = "system-report", skill = "off" },       # the ability's tools, without its skill
  { name = "filesystem", roots = ["~/notes", { path = "~/site", readOnly = true }] }  # the folders it may work in
]
```

| Key | Purpose |
| --- | --- |
| `name` | the ability's folder name |
| `skill` | `load` (listed under ## Skills, loaded with `load_skill` when needed), `sticky` (always in the system prompt, its other files still opened with `load_skill`) or `off`. Unset follows the SKILL.md's `sticky`, else `load` |
| `tools` | only these of the ability's tools; unset means all of them |
| `roots` | the folders an MCP server that takes roots (like `filesystem`) may work in while this persona is active. Absolute paths or `~/…`; one that isn't an existing folder is left out with a warning. Without any, that ability is off for the persona. `{ path = "…", readOnly = true }` lets it only read there, and `backup = true` has Kaja copy each file before it's changed (see [MCP servers](/abilities/mcp#mcp-abilities)) |

An ability that needs a key you haven't saved is left out, and the rest still load. Shipped personas list no
`roots`, and `kaja abilities update` would replace your edits to them, so give folders in a persona of your own. An MCP server starts
only when a persona that lists it becomes active, so a chat that never needs the browser never starts one.

## Switching

Every persona's `when` goes into the system prompt, so the model can call `switch_persona` on its own
mid-conversation. A persona without `when` can only be reached from the
[persona picker](/using/tui#key-bar).

- **Automatic** (`switch_persona`) keeps the current conversation going.
- **Manual** (the picker) starts a fresh one, and isn't remembered: every launch starts from `default`.

The new persona's abilities apply from the next model call: its tools replace the old ones, and its MCP
servers connect then. A persona with a `models` pin swaps the model too, otherwise the current one stays. A pin to an id your
`models.toml` doesn't have (expected for a persona written elsewhere) falls back to that task's default
instead of failing to load.

Both work in cloud mode too, among every persona in the cloud's copy of the marketplace.

## Shipped personas

| Id | What it does |
| --- | --- |
| `default` | fallback for anything no other persona fits; uses every marketplace ability |
| `care` | self-care companion: listens, reflects, doesn't lecture |
| `barkochba` | plays Twenty Questions, asking through `ask_user` |
| `onboarding` | walks a new user through the [`onboarding` profile](/abilities/memory#the-onboarding-profile); uses `geo-service`, `time` and `open-meteo` |
| `config-hyprland` | changes your Hyprland desktop live (Lua config): previews, saves on your yes, backs up `~/.config/hypr` files first; local only |

Read them in [`marketplace/personas`](https://github.com/kajaio/kaja/tree/main/marketplace/personas).

---

Next:

[Skills](/abilities/skills){: .btn .btn-green .fs-5 }
