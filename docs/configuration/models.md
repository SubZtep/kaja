---
layout: page
title: Models
parent: Configuration
nav_order: 3.2
---

# Models

`models.toml` declares providers, a set of reachable models, and which one is active for each
task. Each provider's `api_key` lives in [`secrets.toml`](/configuration/secrets) under a matching
`[providers.<name>]` table — this file only holds `base_url` and the model definitions.

## Models

Each model is a `[models.<id>]` table, keyed by a stable id (e.g. `"fast-chat"`) — referenced by
`[active].<task>` and by a persona's own `[models].<task>` override. It should include:

- `model`: the provider-specific model name sent in API requests.
- `task`: the task this model serves (`chat`, `embedding`, `image-generation`, `text-to-speech`, `speech-to-text`, `rerank`).
- `provider`: the provider key from `[providers.*]` to use.

Example:

```toml
[providers.ollama]
base_url = "http://localhost:11434/v1"

[models.fast-chat]
model = "llama3.2:1b"
task = "chat"
provider = "ollama"
```

Ollama needs *some* `api_key` string even though it ignores its value — set it in `secrets.toml`:

```toml
[providers.ollama]
api_key = "ollama"
```

## Active model

`[active]` picks one model id per task — the model actually in use unless a persona overrides it:

```toml
[active]
chat = "fast-chat"
embedding = "default-embedding"
```

Every task is optional. Omitting `active.chat` falls back to the free hosted chat tier; the other
five tasks stay "not configured" until their `[active].<task>` (or a persona's pin) names a
model.

## Persona overrides

A persona's own `[models]` table (in `personas/<id>.toml`) can pin a different model id per
task, independently of `[active]`:

```toml
[models]
chat = "reasoning-chat"
```

Each task is optional; an unset or unresolved pin (e.g. an id that doesn't exist in this
install's `models.toml` — expected for a persona shared from elsewhere) falls back to
`[active].<task>` rather than failing to load.

Notes:

- The shipped templates cover local Ollama (`llama3.2:1b`, `qwen2.5:0.5b`, `qwen3:1.7b`, `llama3.2:3b`) and hosted Fireworks.
- To switch which model handles a task by default, change `[active].<task>` in `models.toml`.

---

Next:

[Services](/configuration/services){: .btn .btn-green .fs-5 }
