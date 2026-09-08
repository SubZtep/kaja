---
layout: page
title: Personas
nav_order: 7
---

# Personas

A persona is a named character the assistant can switch into — its own instructions, and optionally
its own model and sampling parameters. One file each under `~/.config/kaja/personas/*.toml`; the
filename is the persona's id.

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
| sampling params | `temperature`, `top_p`, `top_k`, `max_tokens`, `frequency_penalty`, `presence_penalty`, `seed` |

## Switching

Every persona's `when` clause goes into the system prompt as a roster, so the model can call
`switch_persona` on its own mid-conversation. Personas without a `when` are never auto-selected —
pick those from the [`/` menu](/tui#the--menu).

The two paths differ:

- **automatic** (`switch_persona`) keeps the current conversation going
- **manual** (`/` menu) starts a fresh one

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

Get fresh copies any time with `kaja config fetch`, or read them in
[`docs/config/personas`](https://github.com/SubZtep/kaja/tree/main/docs/config/personas).

> Two contracts are injected by Kaja itself and should **not** be restated in `instructions`: that
> questions go through the `ask_user` tool, and the `dataset_info` get-status/answer protocol.
{: .note }

## Hosted mode

Hosted chat uses a server-side persona catalog managed from the [admin portal](/development/web),
not your local files. `switch_persona` still works; the `/` menu picker doesn't.

---

Next:

[Tools](/tools){: .btn .btn-green .fs-5 }
