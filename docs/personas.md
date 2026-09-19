---
layout: page
title: Personas
nav_order: 7
---

# Personas

A persona is a named character the assistant can switch into — its own instructions, and optionally
its own model and sampling parameters. Personas are [marketplace](/skills#the-marketplace) packages:
one file each under `~/.config/kaja/marketplace/personas/<id>.toml`, where the file name is the
persona's id (lowercase letters, digits and single hyphens).

Only the personas `~/.config/kaja/packages.toml` lists load; `kaja pkg` picks them in its Personas
group. `default` is the exception: it always loads, and a fresh install has it built in. Put a
`default.toml` in the folder (the marketplace sync brings one) and that one is used instead.

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
| `when` | short clause telling the model when to auto-switch here |
| `dataset` | id of a [dataset](/memory#datasets) this persona collects |
| `models` | pin a model id per task, e.g. `chat = "reasoning-chat"` |
| `skills` | [skills](/skills) this persona may use; unset means every enabled skill, `[]` means none |
| sampling params | `temperature`, `top_p`, `top_k`, `max_tokens`, `frequency_penalty`, `presence_penalty`, `seed` |

## Switching

Every persona's `when` clause goes into the system prompt as a roster, so the model can call
`switch_persona` on its own mid-conversation. Personas without a `when` are never auto-selected —
pick those from the [key bar's persona picker](/tui#key-bar).

The two paths differ:

- **automatic** (`switch_persona`) keeps the current conversation going
- **manual** (persona picker) starts a fresh one

A persona that pins a model swaps the model too; otherwise the current one is kept. An unresolvable
pin — an id that doesn't exist in this install's `models.toml`, which is expected for a persona
shared from elsewhere — falls back to the default for that task instead of failing to load.

## Shipped examples

| Id | What it does |
| --- | --- |
| `default` | fallback for anything no other persona fits |
| `care` | self-care companion — listens, reflects, doesn't lecture |
| `barkochba` | plays Twenty Questions, asking through `ask_user` |
| `onboarding` | walks a new user through the `onboarding` dataset |

`kaja pkg update` brings them (and their updates) into the marketplace folder; read them in
[`marketplace/personas`](https://github.com/SubZtep/kaja/tree/main/marketplace/personas).

> Two contracts are injected by Kaja itself and should **not** be restated in `instructions`: that
> questions go through the `ask_user` tool, and the `dataset_info` get-status/answer protocol.
{: .note }

## Cloud mode

Cloud chat uses a server-side persona catalog managed from the [admin portal](/development/web),
not your local files. Both `switch_persona` and the key bar's persona picker work in cloud mode.

---

Next:

[Tools](/tools){: .btn .btn-green .fs-5 }
