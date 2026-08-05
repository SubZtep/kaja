---
layout: page
title: Personas
nav_order: 4
---

# Personas

A persona is a named character the assistant can switch into — its own instructions, and
optionally its own model and sampling parameters. One file each under
`~/.config/kaja/personas/*.toml`; the filename is the persona's id.

```toml
label = "Helpful assistant"
when = "no other persona clearly fits the conversation"
```

| Field | Purpose |
| --- | --- |
| `label` | display name (required) |
| `instructions` | system-prompt text for this persona |
| `model` | override the default chat model |
| `when` | short clause telling the model when to auto-switch here |
| `dataset` | id of a dataset this persona collects |
| sampling params | `temperature`, `top_p`, `max_tokens`, `frequency_penalty`, `presence_penalty`, `seed` |

Every persona's `when` clause goes into the system prompt as a roster, so the model can call
`switch_persona` mid-conversation on its own.

Shipped examples: **`default`** (fallback), **`care`** (self-care companion), **`barkochba`**
(plays Twenty Questions), **`onboarding`** (walks through set-up questions).

A persona with a `dataset` collects a defined set of fields via the `dataset_info` tool —
see `docs/config/datasets/` for the format.
