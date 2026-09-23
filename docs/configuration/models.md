---
layout: page
title: Models
parent: Configuration
nav_order: 2
---

# models.toml

`models.toml` declares providers, the models they serve, and which model handles each task. A
provider's `api_key` lives in [`secrets.toml`](/configuration/secrets) under the same
`[providers.<name>]` table; this file holds only `base_url` and the models.

```toml
[providers.ollama]
base_url = "http://localhost:11434/v1"

[models.chat]
model = "llama3.2:1b"
task = "chat"
provider = "ollama"
```

Each `[models.<id>]` entry has:

- `model` — the provider's own model name, sent in API requests;
- `task` — `chat`, `embedding`, `image-generation`, `tts`, `stt` or `rerank`;
- `provider` — a key from `[providers.*]`.

**The entry whose id equals its task is the one in use**: `[models.chat]` serves chat. Other models for
the same task can sit beside it under other ids — the wizard writes them as `[models.<provider>-<task>]`,
e.g. `[models.ollama-chat]` — for a [persona](/personas) to pin, or for
[`kaja doctor`](/configuration#checking-keys-and-models) to switch to when the one in use stops
answering.

`[models.chat]` is **required** in local mode; without it the CLI exits with an error. The other tasks
stay off, with the features that need them, until their entry exists.

Ollama ignores the key but needs *some* value, so set one in `secrets.toml`:

```toml
[providers.ollama]
api_key = "ollama"
```

## Examples

Three example files live in [`docs/config`](https://github.com/SubZtep/kaja/tree/main/docs/config).
The setup wizard writes `models.toml` from the same provider catalogue, in the combination you tick.

| File | Providers | Tasks |
| --- | --- | --- |
| `models.ollama.toml` | Ollama | chat, embedding — fully local |
| `models.fireworks.toml` | Fireworks, xAI, Speaches | chat, embedding, rerank, image-generation, tts |
| `models.llama.toml` | llama.cpp, xAI | chat against a local `llama-server` |

---

Next:

[Secrets](/configuration/secrets){: .btn .btn-green .fs-5 }
