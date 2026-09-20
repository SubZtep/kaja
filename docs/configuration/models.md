---
layout: page
title: Models
parent: Configuration
nav_order: 4.2
---

# Models

`models.toml` declares providers, a set of reachable models, and which one is active for each
task. Each provider's `api_key` lives in [`secrets.toml`](/configuration/secrets) under a matching
`[providers.<name>]` table — this file only holds `base_url` and the model definitions.

## Models

Each model is a `[models.<task>]` table, keyed by its task name (e.g. `"chat"`) — that's how the
CLI finds the model to use for a task, and how a persona's own `[models].<task>` override can pin
a different model id instead. It should include:

- `model`: the provider-specific model name sent in API requests.
- `task`: the task this model serves (`chat`, `embedding`, `image-generation`, `tts`, `stt`, `rerank`).
- `provider`: the provider key from `[providers.*]` to use.

The entry whose id equals its task is the one used. More models for the same task can sit beside it
under other ids — the setup wizard writes them as `[models.<provider>-<task>]`, e.g.
`[models.ollama-chat]` next to `[models.chat]` — and a persona pins one by id.

Example:

```toml
[providers.ollama]
base_url = "http://localhost:11434/v1"

[models.chat]
model = "llama3.2:1b"
task = "chat"
provider = "ollama"
```

Ollama needs *some* `api_key` string even though it ignores its value — set it in `secrets.toml`:

```toml
[providers.ollama]
api_key = "ollama"
```

`[models.chat]` is **required** in [local mode](/modes) — without a resolvable chat model the CLI
exits with an error rather than silently falling back to cloud chat. Use `kaja --cloud` if you
want the cloud tier. The other five tasks stay "not configured" until their `[models.<task>]`
entry (or a persona's pin) exists, and the features that need them stay off.

## Persona overrides

A persona's own `[models]` table (in `personas/<id>.toml`) can pin a different model id per
task, independently of the task-named default:

```toml
[models]
chat = "reasoning-chat"
```

Each task is optional; an unset or unresolved pin (e.g. an id that doesn't exist in this
install's `models.toml` — expected for a persona shared from elsewhere) falls back to
`[models.<task>]` rather than failing to load.

## Shipped templates

Three starting points live in
[`docs/config`](https://github.com/SubZtep/kaja/tree/main/docs/config):

| Template | Providers | Notes |
| --- | --- | --- |
| `models.ollama.toml` | Ollama | chat + embedding, fully local. |
| `models.fireworks.toml` | Fireworks, xAI, Speaches | chat, embedding, rerank, image-generation, tts. |
| `models.llama.toml` | llama.cpp, xAI | chat against a local `llama-server`. |

The setup wizard doesn't copy these: it writes `models.toml` from the same providers and models, in
the combination you choose, so the examples and what it writes stay the same.

To switch which model handles a task, edit or add its `[models.<task>]` entry — or run
`kaja config fetch` to pull a catalog from a Kaja server.

---

Next:

[Secrets](/configuration/secrets){: .btn .btn-green .fs-5 }
